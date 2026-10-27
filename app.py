"""MovieSuggest Flask backend.

MongoDB connections are deliberately lazy: importing/starting the server does
not connect to a database. The first account/watchlist/rating request connects.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlencode

import requests
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, abort, g, jsonify, redirect, request, send_from_directory, session
from pymongo import ASCENDING, MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from werkzeug.security import check_password_hash, generate_password_hash


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

app = Flask(__name__, static_folder=None)
app.config.update(
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY") or secrets.token_hex(32),
    MONGO_URI=os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017/moviesuggest").strip(),
    MONGO_DATABASE=os.getenv("MONGO_DATABASE", "moviesuggest").strip(),
    TMDB_API_KEY=os.getenv("TMDB_API_KEY", "").strip(),
    TMDB_READ_ACCESS_TOKEN=os.getenv("TMDB_READ_ACCESS_TOKEN", "").strip(),
    GOOGLE_CLIENT_ID=os.getenv("GOOGLE_CLIENT_ID", "").strip(),
    GOOGLE_CLIENT_SECRET=os.getenv("GOOGLE_CLIENT_SECRET", "").strip(),
    GOOGLE_REDIRECT_URI=os.getenv(
        "GOOGLE_REDIRECT_URI", "http://127.0.0.1:5000/auth/google/callback"
    ).strip(),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 7,
)

oauth = OAuth(app)
_mongo_client: MongoClient | None = None
_mongo_lock = threading.Lock()
_indexes_ready = False
_tmdb_cache: dict[str, tuple[float, object]] = {}
_tmdb_cache_lock = threading.Lock()

with (ROOT / "data" / "movies.json").open(encoding="utf-8") as stream:
    SEED = json.load(stream)
LOCAL_MOVIES = SEED["MOVIES"]
GENRES = SEED["GENRES"]
TRENDING_IDS = SEED["TRENDING_IDS"]
POPULAR_IDS = SEED["POPULAR_IDS"]
TOP_RATED_IDS = SEED["TOP_RATED_IDS"]
LOCAL_BY_ID = {str(item["id"]): item for item in LOCAL_MOVIES}

TMDB_GENRES = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
}
TMDB_GENRE_IDS = {name.lower(): ident for ident, name in TMDB_GENRES.items()}
PAGES = {
    "index.html", "login.html", "signup.html", "movie.html", "profile.html",
    "search.html", "watchlist.html", "about.html",
}


class DatabaseUnavailable(Exception):
    """MongoDB is missing or could not be reached."""


class TMDBUnavailable(Exception):
    """TMDB could not provide a response."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_db():
    """Open MongoDB only when a database-backed route actually needs it."""
    global _mongo_client, _indexes_ready
    uri = app.config.get("MONGO_URI", "")
    if not uri:
        raise DatabaseUnavailable("MongoDB connection string is missing. Set MONGO_URI in .env.")
    try:
        with _mongo_lock:
            if _mongo_client is None:
                _mongo_client = MongoClient(
                    uri,
                    serverSelectionTimeoutMS=2500,
                    connectTimeoutMS=2500,
                    appname="MovieSuggest",
                )
            _mongo_client.admin.command("ping")
            db = _mongo_client[app.config["MONGO_DATABASE"]]
            if not _indexes_ready:
                db.users.create_index([("email", ASCENDING)], unique=True)
                db.users.create_index(
                    [("google_sub", ASCENDING)],
                    unique=True,
                    partialFilterExpression={"google_sub": {"$type": "string"}},
                )
                db.watchlist.create_index([("user_id", ASCENDING), ("movie_id", ASCENDING)], unique=True)
                db.ratings.create_index([("user_id", ASCENDING), ("movie_id", ASCENDING)], unique=True)
                _indexes_ready = True
            return db
    except (PyMongoError, OSError, ValueError) as exc:
        raise DatabaseUnavailable(
            "MongoDB se connection nahi ho paya. MongoDB service aur MONGO_URI check karo."
        ) from exc


def public_user(user: dict | None) -> dict | None:
    if not user:
        return None
    return {"id": str(user.get("_id", "")), "name": user.get("name", ""), "email": user.get("email", "")}


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_db().users.find_one({"_id": user_id})


def require_login(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify(error="login_required", message="Pehle login karo."), 401
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapped


@app.before_request
def protect_api_mutations():
    if request.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        expected = session.get("csrf_token", "")
        supplied = request.headers.get("X-CSRF-Token", "")
        if not expected or not secrets.compare_digest(expected, supplied):
            return jsonify(error="csrf_failed", message="Page refresh karke dobara try karo."), 400


@app.errorhandler(DatabaseUnavailable)
def database_error(exc):
    return jsonify(error="database_unavailable", message=str(exc)), 503


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return jsonify(error="not_found", message="Requested API route nahi mili."), 404
    return "Page not found", 404


@app.get("/api/health")
def health():
    # This endpoint does not ping MongoDB, so it is safe before the user asks us
    # to make the database connection.
    return jsonify(
        status="ok",
        database_configured=bool(app.config.get("MONGO_URI")),
        database_checked=False,
        tmdb_configured=bool(app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN")),
        google_configured=bool(app.config.get("GOOGLE_CLIENT_ID") and app.config.get("GOOGLE_CLIENT_SECRET")),
    )


@app.get("/api/auth/csrf")
def csrf_token():
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return jsonify(csrf_token=token)


def json_body() -> dict:
    return request.get_json(silent=True) or {}


def reset_session_for_user(user_id: str):
    csrf_token = session.get("csrf_token") or secrets.token_urlsafe(32)
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["csrf_token"] = csrf_token


@app.get("/api/auth/me")
def auth_me():
    # Anonymous page views do not need MongoDB.
    if not session.get("user_id"):
        return jsonify(user=None)
    user = current_user()
    if not user:
        session.clear()
        return jsonify(user=None)
    return jsonify(user=public_user(user))


@app.post("/api/auth/signup")
def signup():
    body = json_body()
    name = str(body.get("name", "")).strip()
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if len(name) < 2 or len(name) > 80:
        return jsonify(error="invalid_name", message="Naam 2 se 80 characters ka hona chahiye."), 400
    if "@" not in email or len(email) > 254:
        return jsonify(error="invalid_email", message="Sahi email address daalo."), 400
    if len(password) < 6 or len(password) > 200:
        return jsonify(error="invalid_password", message="Password kam se kam 6 characters ka rakho."), 400
    db = get_db()
    if db.users.find_one({"email": email}, {"_id": 1}):
        return jsonify(error="email_exists", message="Is email par account pehle se bana hua hai."), 409
    user = {
        "_id": uuid.uuid4().hex,
        "name": name,
        "email": email,
        "password_hash": generate_password_hash(password),
        "created_at": utc_now(),
    }
    try:
        db.users.insert_one(user)
    except DuplicateKeyError:
        return jsonify(error="email_exists", message="Is email par account pehle se bana hua hai."), 409
    reset_session_for_user(user["_id"])
    return jsonify(user=public_user(user)), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    email = str(body.get("email", "")).strip().lower()
    password = str(body.get("password", ""))
    if not email or not password:
        return jsonify(error="missing_credentials", message="Email aur password dono daalo."), 400
    user = get_db().users.find_one({"email": email})
    if not user or not user.get("password_hash") or not check_password_hash(user["password_hash"], password):
        return jsonify(error="invalid_credentials", message="Email ya password sahi nahi hai."), 401
    reset_session_for_user(user["_id"])
    return jsonify(user=public_user(user))


@app.post("/api/auth/logout")
@require_login
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/auth/google")
def google_login():
    client_id = app.config.get("GOOGLE_CLIENT_ID")
    client_secret = app.config.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return redirect("/login.html?auth_error=google_not_configured")
    if oauth.create_client("google") is None:
        oauth.register(
            name="google",
            client_id=client_id,
            client_secret=client_secret,
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
    return oauth.google.authorize_redirect(app.config["GOOGLE_REDIRECT_URI"])


@app.get("/auth/google/callback")
def google_callback():
    if not (app.config.get("GOOGLE_CLIENT_ID") and app.config.get("GOOGLE_CLIENT_SECRET")):
        return redirect("/login.html?auth_error=google_not_configured")
    try:
        token = oauth.google.authorize_access_token()
        profile = token.get("userinfo") or {}
        email = str(profile.get("email", "")).strip().lower()
        subject = str(profile.get("sub", "")).strip()
        if not email or not subject or not profile.get("email_verified"):
            return redirect("/login.html?auth_error=google_email_unverified")
        db = get_db()
        user = db.users.find_one({"google_sub": subject}) or db.users.find_one({"email": email})
        if user:
            if not user.get("google_sub"):
                db.users.update_one({"_id": user["_id"]}, {"$set": {"google_sub": subject}})
                user["google_sub"] = subject
        else:
            user = {
                "_id": uuid.uuid4().hex,
                "name": str(profile.get("name") or email.split("@", 1)[0])[:80],
                "email": email,
                "password_hash": None,
                "google_sub": subject,
                "created_at": utc_now(),
            }
            db.users.insert_one(user)
        reset_session_for_user(user["_id"])
        return redirect("/profile.html")
    except DatabaseUnavailable:
        return redirect("/login.html?auth_error=database_unavailable")
    except Exception:
        app.logger.exception("Google sign-in callback failed")
        return redirect("/login.html?auth_error=google_failed")


def tmdb_get(endpoint: str, params: dict | None = None):
    api_key = app.config.get("TMDB_API_KEY")
    access_token = app.config.get("TMDB_READ_ACCESS_TOKEN")
    if not api_key and not access_token:
        raise TMDBUnavailable("TMDB key set nahi hai. Abhi sample movie catalog dikh raha hai.")
    params = dict(params or {})
    headers = {"Accept": "application/json"}
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    else:
        params["api_key"] = api_key
    cache_key = endpoint + "?" + urlencode(sorted(params.items()))
    now = time.time()
    with _tmdb_cache_lock:
        cached = _tmdb_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]
    try:
        response = requests.get(
            f"https://api.themoviedb.org/3/{endpoint.lstrip('/')}",
            params=params,
            headers=headers,
            timeout=8,
        )
        if response.status_code >= 400:
            raise TMDBUnavailable(f"TMDB ne error diya ({response.status_code}). API key check karo.")
        data = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise TMDBUnavailable("TMDB tak pahunch nahi hui. Internet aur API key check karo.") from exc
    with _tmdb_cache_lock:
        _tmdb_cache[cache_key] = (now + 600, data)
    return data


def normalize_local(movie: dict) -> dict:
    return {
        "id": int(movie["id"]), "title": movie.get("title", ""), "year": movie.get("year"),
        "rating": movie.get("rating", 0), "runtime": movie.get("runtime") or 0,
        "genre": list(movie.get("genre") or []), "poster": movie.get("poster") or "",
        "backdrop": movie.get("backdrop") or "", "overview": movie.get("overview") or "",
        "director": movie.get("director") or "", "cast": list(movie.get("cast") or []),
    }


def normalize_tmdb(movie: dict, details: bool = False) -> dict:
    release_date = movie.get("release_date") or ""
    credits = movie.get("credits") or {}
    director = next((person.get("name", "") for person in credits.get("crew", [])
                     if person.get("job") == "Director"), "")
    genre_names = movie.get("genres")
    if genre_names and isinstance(genre_names[0], dict):
        genre_names = [genre.get("name", "") for genre in genre_names]
    if not genre_names:
        genre_names = [TMDB_GENRES.get(int(genre_id), "") for genre_id in movie.get("genre_ids", [])]
    cast = [person.get("name", "") for person in credits.get("cast", [])[:8]]
    return {
        # Prefix live TMDB ids so they cannot collide with the prototype's
        # small local ids (for example, local id 11 is not TMDB movie 11).
        "id": f"tmdb-{int(movie.get('id', 0))}",
        "title": movie.get("title") or movie.get("original_title") or "Untitled",
        "year": int(release_date[:4]) if release_date[:4].isdigit() else None,
        "rating": round(float(movie.get("vote_average") or 0), 1),
        "runtime": int(movie.get("runtime") or 0),
        "genre": [name for name in genre_names if name],
        "poster": f"https://image.tmdb.org/t/p/w500{movie['poster_path']}" if movie.get("poster_path") else "",
        "backdrop": f"https://image.tmdb.org/t/p/original{movie['backdrop_path']}" if movie.get("backdrop_path") else "",
        "overview": movie.get("overview") or "No overview is available yet.",
        "director": director,
        "cast": cast,
    }


def local_list(sort: str = "popular", genre: str = "") -> list[dict]:
    by_id = LOCAL_BY_ID
    order = {"trending": TRENDING_IDS, "popular": POPULAR_IDS, "top_rated": TOP_RATED_IDS}.get(sort)
    movies = [normalize_local(by_id[str(ident)]) for ident in order if str(ident) in by_id] if order else [normalize_local(m) for m in LOCAL_MOVIES]
    if not order and sort == "top_rated":
        movies.sort(key=lambda m: m["rating"], reverse=True)
    if genre:
        movies = [m for m in movies if any(genre.lower() == g.lower() for g in m["genre"])]
    return movies


def tmdb_movie_list(sort: str = "popular", genre: str = "", page: int = 1) -> list[dict]:
    page = min(max(int(page or 1), 1), 5)
    if genre:
        params = {"page": page, "language": "en-US", "include_adult": "false"}
        lowered = genre.lower()
        if lowered == "bollywood":
            params["with_origin_country"] = "IN"
        elif lowered == "hollywood":
            params["with_origin_country"] = "US"
        elif lowered in TMDB_GENRE_IDS:
            params["with_genres"] = TMDB_GENRE_IDS[lowered]
        else:
            return []
        data = tmdb_get("discover/movie", params)
    else:
        endpoint = {"trending": "trending/movie/week", "top_rated": "movie/top_rated"}.get(sort, "movie/popular")
        data = tmdb_get(endpoint, {"page": page, "language": "en-US"})
    return [normalize_tmdb(movie) for movie in data.get("results", [])]


def list_movies(sort: str = "popular", genre: str = "", page: int = 1) -> list[dict]:
    if app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN"):
        return tmdb_movie_list(sort, genre, page)
    return local_list(sort, genre)


def movie_details(movie_id: str) -> dict | None:
    if movie_id in LOCAL_BY_ID:
        return normalize_local(LOCAL_BY_ID[movie_id])
    if not (app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN")):
        return None
    remote_id = movie_id[5:] if movie_id.startswith("tmdb-") else movie_id
    if not remote_id.isdigit():
        return None
    data = tmdb_get(f"movie/{remote_id}", {"append_to_response": "credits", "language": "en-US"})
    return normalize_tmdb(data, details=True)


def canonical_movie_id(value: str) -> str | None:
    if value.startswith("tmdb-") and value[5:].isdigit():
        return f"tmdb-{int(value[5:])}"
    if value.isdigit():
        return str(int(value))
    return None


@app.get("/api/genres")
def api_genres():
    return jsonify(genres=GENRES)


@app.get("/api/movies")
def api_movies():
    sort = request.args.get("sort", "popular").lower()
    if sort not in {"trending", "popular", "top_rated"}:
        sort = "popular"
    genre = request.args.get("genre", "").strip()
    try:
        movies = list_movies(sort, genre, request.args.get("page", 1))
    except (TMDBUnavailable, ValueError) as exc:
        return jsonify(error="tmdb_unavailable", message=str(exc)), 502
    return jsonify(results=movies, genres=GENRES, source="tmdb" if app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN") else "sample")


@app.get("/api/movies/search")
def api_movie_search():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify(results=[])
    if app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN"):
        try:
            params = {"language": "en-US", "include_adult": "false", "page": 1}
            if query.isdigit() and len(query) == 4:
                data = tmdb_get("discover/movie", {**params, "primary_release_year": query, "sort_by": "popularity.desc"})
                raw_results = data.get("results", [])
            elif query.casefold() in TMDB_GENRE_IDS or query.casefold() in {"bollywood", "hollywood"}:
                genre = query.casefold()
                if genre == "bollywood": params["with_origin_country"] = "IN"
                elif genre == "hollywood": params["with_origin_country"] = "US"
                else: params["with_genres"] = TMDB_GENRE_IDS[genre]
                data = tmdb_get("discover/movie", {**params, "sort_by": "popularity.desc"})
                raw_results = data.get("results", [])
            else:
                data = tmdb_get("search/movie", {**params, "query": query})
                raw_results = list(data.get("results", []))
                # Movie search covers titles. Also check TMDB's people index so
                # searches for a director's name can return their films.
                people = tmdb_get("search/person", {**params, "query": query}).get("results", [])
                for person in people[:5]:
                    if person.get("known_for_department") != "Directing":
                        continue
                    directed = tmdb_get("discover/movie", {
                        **params,
                        "with_crew": person.get("id"),
                        "sort_by": "popularity.desc",
                    }).get("results", [])
                    raw_results.extend(directed)
            unique = {str(item.get("id")): item for item in raw_results if item.get("id")}
            ranked = sorted(unique.values(), key=lambda item: float(item.get("popularity") or 0), reverse=True)
            return jsonify(results=[normalize_tmdb(item) for item in ranked[:40]])
        except TMDBUnavailable as exc:
            return jsonify(error="tmdb_unavailable", message=str(exc)), 502
    q = query.casefold()
    matches = []
    for movie in LOCAL_MOVIES:
        haystack = " ".join([
            movie.get("title", ""), movie.get("director", ""), str(movie.get("year", "")),
            movie.get("overview", ""), " ".join(movie.get("genre", [])), " ".join(movie.get("cast", [])),
        ]).casefold()
        if q in haystack:
            matches.append(normalize_local(movie))
    matches.sort(key=lambda item: item["rating"], reverse=True)
    return jsonify(results=matches[:40])


@app.get("/api/movies/<movie_id>")
def api_movie_detail(movie_id: str):
    movie_id = canonical_movie_id(movie_id)
    if not movie_id:
        return jsonify(error="invalid_movie_id", message="Movie id valid nahi hai."), 400
    try:
        movie = movie_details(movie_id)
    except TMDBUnavailable as exc:
        return jsonify(error="tmdb_unavailable", message=str(exc)), 502
    if not movie:
        return jsonify(error="movie_not_found", message="Movie nahi mili."), 404
    return jsonify(movie=movie)


def recommendation_text(movie: dict) -> str:
    return " ".join([
        str(movie.get("title", "")), str(movie.get("overview", "")),
        " ".join(movie.get("genre", [])), str(movie.get("director", "")),
        " ".join(movie.get("cast", [])),
    ])


def recommend_for(movie: dict, limit: int = 6) -> list[dict]:
    candidates_by_id = {str(item["id"]): normalize_local(item) for item in LOCAL_MOVIES}
    # Reuse the current TMDB popular list as extra recommendation material;
    # this keeps the text recommender useful without storing API keys or movie
    # catalogs in MongoDB.
    if app.config.get("TMDB_API_KEY") or app.config.get("TMDB_READ_ACCESS_TOKEN"):
        try:
            for item in tmdb_movie_list("popular", page=1):
                candidates_by_id[str(item["id"])] = item
        except TMDBUnavailable:
            pass
    candidates_by_id[str(movie["id"])] = movie
    candidates = [candidate for key, candidate in candidates_by_id.items() if key != str(movie["id"])]
    if not candidates:
        return []
    all_docs = [recommendation_text(movie)] + [recommendation_text(item) for item in candidates]
    try:
        matrix = TfidfVectorizer(stop_words="english", max_features=12000).fit_transform(all_docs)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    except ValueError:
        return []
    ranked = sorted(zip(scores, candidates), key=lambda pair: pair[0], reverse=True)
    return [item for score, item in ranked if score > 0][:limit]


@app.get("/api/recommendations/<movie_id>")
def api_recommendations(movie_id: str):
    movie_id = canonical_movie_id(movie_id)
    if not movie_id:
        return jsonify(error="invalid_movie_id", message="Movie id valid nahi hai."), 400
    try:
        movie = movie_details(movie_id)
        if not movie:
            return jsonify(error="movie_not_found", message="Movie nahi mili."), 404
        return jsonify(becauseMovie=movie, movies=recommend_for(movie))
    except TMDBUnavailable as exc:
        return jsonify(error="tmdb_unavailable", message=str(exc)), 502


@app.get("/api/watchlist")
@require_login
def get_watchlist():
    db = get_db()
    docs = list(db.watchlist.find({"user_id": g.current_user["_id"]}).sort("created_at", DESCENDING))
    items = []
    for doc in docs:
        movie_id = str(doc.get("movie_id", ""))
        try:
            movie = movie_details(movie_id)
        except TMDBUnavailable:
            movie = None
        items.append({"movie_id": movie_id, "movie": movie})
    return jsonify(items=items)


@app.post("/api/watchlist/<movie_id>")
@require_login
def add_watchlist(movie_id: str):
    movie_id = canonical_movie_id(movie_id)
    if not movie_id:
        return jsonify(error="invalid_movie_id", message="Movie id valid nahi hai."), 400
    db = get_db()
    try:
        movie = movie_details(movie_id)
    except TMDBUnavailable as exc:
        return jsonify(error="tmdb_unavailable", message=str(exc)), 502
    if not movie:
        return jsonify(error="movie_not_found", message="Movie nahi mili."), 404
    db.watchlist.update_one(
        {"user_id": g.current_user["_id"], "movie_id": movie_id},
        {"$setOnInsert": {"created_at": utc_now()}},
        upsert=True,
    )
    return jsonify(ok=True, movie_id=movie_id, movie=movie), 201


@app.delete("/api/watchlist/<movie_id>")
@require_login
def remove_watchlist(movie_id: str):
    result = get_db().watchlist.delete_one({"user_id": g.current_user["_id"], "movie_id": movie_id})
    return jsonify(ok=True, removed=result.deleted_count > 0, movie_id=movie_id)


@app.get("/api/ratings")
@require_login
def get_ratings():
    docs = get_db().ratings.find({"user_id": g.current_user["_id"]}, {"_id": 0, "movie_id": 1, "stars": 1})
    return jsonify(items=list(docs))


@app.put("/api/ratings/<movie_id>")
@require_login
def save_rating(movie_id: str):
    movie_id = canonical_movie_id(movie_id)
    body = json_body()
    stars = body.get("stars")
    if not movie_id or not isinstance(stars, int) or isinstance(stars, bool) or not 1 <= stars <= 5:
        return jsonify(error="invalid_rating", message="Movie id aur 1 se 5 ke beech rating do."), 400
    try:
        movie = movie_details(movie_id)
    except TMDBUnavailable as exc:
        return jsonify(error="tmdb_unavailable", message=str(exc)), 502
    if not movie:
        return jsonify(error="movie_not_found", message="Movie nahi mili."), 404
    get_db().ratings.update_one(
        {"user_id": g.current_user["_id"], "movie_id": movie_id},
        {"$set": {"stars": stars, "updated_at": utc_now()}},
        upsert=True,
    )
    return jsonify(ok=True, movie_id=movie_id, stars=stars)


@app.delete("/api/ratings/<movie_id>")
@require_login
def delete_rating(movie_id: str):
    result = get_db().ratings.delete_one({"user_id": g.current_user["_id"], "movie_id": movie_id})
    return jsonify(ok=True, removed=result.deleted_count > 0)


@app.get("/")
def home_page():
    return send_from_directory(ROOT, "index.html")


@app.get("/<path:filename>")
def frontend_files(filename: str):
    if filename in PAGES or filename.startswith(("assets/", "css/", "js/")):
        target = ROOT / filename
        if target.is_file():
            return send_from_directory(ROOT, filename)
    abort(404)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5000")), debug=False)
