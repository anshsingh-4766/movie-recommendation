# MovieSuggest

MovieSuggest is a responsive movie discovery site with a Flask backend. The existing HTML/CSS/JavaScript design is served by Flask; the backend provides movie data, user accounts, watchlists, ratings, and text-similarity recommendations.

## Backend stack

- Python and Flask
- MongoDB using PyMongo for user accounts, watchlists, and ratings
- TMDB API for live movie information, posters, and backdrops
- scikit-learn TF-IDF and cosine similarity for recommendations
- Authlib for optional Google sign-in

The included local movie catalog is used when no TMDB credential is configured. MongoDB is only contacted when a signed-in session or an account/watchlist/rating operation needs it. The `/api/health` endpoint does not connect to or ping MongoDB.

## Windows setup

### 1. Install MongoDB

Install MongoDB Community Server for Windows and select its service option during setup. MongoDB Compass is optional; it lets you view the database. Follow the [official MongoDB Windows installation guide](https://www.mongodb.com/docs/manual/administration/install-community-windows/) and [Compass connection guide](https://www.mongodb.com/docs/compass/connect/).

After installation, open PowerShell as Administrator only if Windows requires it to start the service:

```powershell
Get-Service MongoDB
Start-Service MongoDB
```

In MongoDB Compass, connect to:

```text
mongodb://127.0.0.1:27017
```

The app creates its `moviesuggest` database and collections when the first account/watchlist/rating API request is made.

### 2. Create the Python environment

Open PowerShell in this project folder, then run:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If PowerShell blocks activation, you can run the project's Python directly without changing execution policy:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Add local settings

```powershell
Copy-Item .env.example .env
```

Open `.env` in VS Code. Change `FLASK_SECRET_KEY` to a long private random value. Keep `.env` on your computer; it is ignored by Git. Never paste real secrets into chat or commit them.

To make a random secret in PowerShell, run `python -c "import secrets; print(secrets.token_hex(32))"` and paste that output as the value of `FLASK_SECRET_KEY` in `.env`.

### 4. Optional: enable live TMDB data

Apply for TMDB API credentials in your TMDB account's API settings. Add either your v3 key to `TMDB_API_KEY` or the API Read Access Token to `TMDB_READ_ACCESS_TOKEN` in `.env`. These credentials are only used by Flask and are never sent to browser JavaScript. Without them, the site uses the included sample movie catalog.

When TMDB data is active, MovieSuggest shows its attribution on the About/Credits page and in the footer. TMDB requires its logo and the notice “This product uses the TMDB API but is not endorsed or certified by TMDB.” for API data/images. See the [TMDB API FAQ](https://developer.themoviedb.org/docs/faq) and [official logo/attribution page](https://www.themoviedb.org/about/logos-attribution).

### 5. Optional: enable Google sign-in

In Google Cloud, create an OAuth client with application type **Web application** and add these exact values:

- Authorized JavaScript origin: `http://127.0.0.1:5000`
- Authorized redirect URI: `http://127.0.0.1:5000/auth/google/callback`

Copy its Client ID and Client Secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Leave them blank if you are not setting up Google sign-in yet. Email/password signup and login do not require Google credentials.

### 6. Run MovieSuggest

```powershell
python app.py
```

Open <http://127.0.0.1:5000>. Do not open the HTML file directly or run `python -m http.server`; the frontend needs the Flask API on the same origin.

## API routes

All endpoints return JSON except the Google OAuth start and callback, which redirect through Google and back to the site.

| Method and route | What it does | Needs sign-in? |
|---|---|---|
| `GET /api/health` | Shows which optional credentials are configured. Does not connect to MongoDB. | No |
| `GET /api/genres` | Returns the sample genre list. | No |
| `GET /api/movies?sort=popular` | Movie list. `sort` can be `popular`, `trending`, or `top_rated`; optional `genre` and `page` filters are supported. | No |
| `GET /api/movies/search?q=...` | Searches live TMDB when configured, otherwise searches the sample catalog. | No |
| `GET /api/movies/<id>` | Movie details. | No |
| `GET /api/recommendations/<id>` | Similar movie suggestions using TF-IDF and cosine similarity. | No |
| `GET /api/auth/csrf` | Gets the session CSRF token used by browser forms. | No |
| `GET /api/auth/me` | Returns the current signed-in user or `null`. An anonymous request does not use MongoDB. | No |
| `POST /api/auth/signup` | JSON body: `{"name":"Your Name","email":"you@example.com","password":"..."}`. Creates account and signs in. | No |
| `POST /api/auth/login` | JSON body: `{"email":"you@example.com","password":"..."}`. | No |
| `POST /api/auth/logout` | Ends the session. | Yes |
| `GET /api/watchlist` | Returns the signed-in user's saved movies. | Yes |
| `POST /api/watchlist/<movie_id>` | Saves a movie to the signed-in user's watchlist. | Yes |
| `DELETE /api/watchlist/<movie_id>` | Removes a movie from the signed-in user's watchlist. | Yes |
| `GET /api/ratings` | Returns the signed-in user's ratings. | Yes |
| `PUT /api/ratings/<movie_id>` | JSON body: `{"stars":1}` through `{"stars":5}`. Saves or changes a rating. | Yes |
| `DELETE /api/ratings/<movie_id>` | Deletes a rating. | Yes |
| `GET /auth/google` | Starts Google sign-in. | Google credentials |
| `GET /auth/google/callback` | Receives Google's sign-in response. | Google credentials |

Changing API requests use a same-origin session CSRF token. The frontend gets it from `/api/auth/csrf` and sends it in the `X-CSRF-Token` header.

## MongoDB data

- `users`: name, normalized email, password hash or Google subject, and creation time
- `watchlist`: user ID, movie ID, and saved time
- `ratings`: user ID, movie ID, star rating, and update time

Passwords are stored as hashes, not plain text. MongoDB indexes prevent duplicate emails and duplicate user/movie watchlist or rating entries. Movie lists/details are cached in process memory for ten minutes when TMDB is enabled; restart the Flask app to clear that temporary cache.

## Known setup requirements

- Live TMDB data needs a TMDB credential; otherwise the included sample catalog works.
- Signup, login, watchlist, and ratings need MongoDB running locally.
- Google sign-in is optional and needs the Google OAuth credentials above.
- TF-IDF recommendations run against the included movie catalog and any TMDB popular titles fetched during the request; a larger catalog can improve the variety of suggestions.

## License

This project is provided for educational and personal use. MovieSuggest is not endorsed or certified by TMDB.
