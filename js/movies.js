/* ============================================================
   MovieSuggest — js/movies.js
   LOCAL DUMMY MOVIE DATA (frontend prototype only).

   >>> BACKEND INTEGRATION NOTE <<<
   When the Flask backend is ready, this file will be replaced
   by data coming from:
       GET /api/movies            (TMDB API; short-lived server cache)
       GET /api/movies/<id>
       GET /api/movies/search?q=
       GET /api/recommendations/<id>
   For now, every function in main.js reads from this array.
   ============================================================ */

const MOVIES = [
  {
    id: 1,
    title: "Interstellar",
    year: 2014,
    rating: 8.7,
    runtime: 169,
    genre: ["Sci-Fi", "Drama", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/xJHokMbljvjADYdit5fK5VQsXEG.jpg",
    overview: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    director: "Akash Varsani",
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain", "Michael Caine"]
  },
  {
    id: 2,
    title: "Inception",
    year: 2010,
    rating: 8.8,
    runtime: 148,
    genre: ["Sci-Fi", "Action", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
    overview: "A thief who steals corporate secrets through dream-sharing technology is given the chance to plant an idea into the mind of a CEO.",
    director: "Christopher Nolan",
    cast: ["Leonardo DiCaprio", "Joseph Gordon-Levitt", "Elliot Page", "Tom Hardy"]
  },
  {
    id: 3,
    title: "The Dark Knight",
    year: 2008,
    rating: 9.0,
    runtime: 152,
    genre: ["Action", "Crime", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/hqkIcbrOHL86UncnHIsHVcVmzue.jpg",
    overview: "When the menace known as the Joker wreaks havoc on Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
    director: "Christopher Nolan",
    cast: ["Christian Bale", "Heath Ledger", "Aaron Eckhart", "Michael Caine"]
  },
  
  
  {
    id: 6,
    title: "Arrival",
    year: 2016,
    rating: 7.9,
    runtime: 116,
    genre: ["Sci-Fi", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/x2FJsf1ElAgr63Y3PNPtJrcmpoe.jpg",
    backdrop: "",
    overview: "A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world.",
    director: "Denis Villeneuve",
    cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"]
  },
  {
    id: 7,
    title: "Ad Astra",
    year: 2019,
    rating: 6.6,
    runtime: 123,
    genre: ["Sci-Fi", "Adventure", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/xBHvZcjRiWyobQ9kxBhO6B2dtRI.jpg",
    backdrop: "",
    overview: "Astronaut Roy McBride undertakes a mission across an unforgiving solar system to uncover the truth about his missing father and his doomed expedition.",
    director: "James Gray",
    cast: ["Brad Pitt", "Tommy Lee Jones", "Ruth Negga"]
  },
  {
    id: 8,
    title: "Blade Runner 2049",
    year: 2017,
    rating: 8.0,
    runtime: 164,
    genre: ["Sci-Fi", "Drama", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/ilRyazdMJwN05exqhwK4tMKBYZs.jpg",
    overview: "A young blade runner discovers a long-buried secret that could plunge what's left of society into chaos.",
    director: "Denis Villeneuve",
    cast: ["Ryan Gosling", "Harrison Ford", "Ana de Armas", "Jared Leto"]
  },
  {
    id: 9,
    title: "The Shawshank Redemption",
    year: 1994,
    rating: 9.3,
    runtime: 142,
    genre: ["Drama", "Crime"],
    poster: "https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
    backdrop: "",
    overview: "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    director: "Frank Darabont",
    cast: ["Tim Robbins", "Morgan Freeman", "Bob Gunton"]
  },
  {
    id: 10,
    title: "The Godfather",
    year: 1972,
    rating: 9.2,
    runtime: 175,
    genre: ["Crime", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    backdrop: "",
    overview: "The aging patriarch of an organized crime dynasty transfers control of his clandestine empire to his reluctant son.",
    director: "Francis Ford Coppola",
    cast: ["Marlon Brando", "Al Pacino", "James Caan"]
  },
  {
    id: 11,
    title: "Pulp Fiction",
    year: 1994,
    rating: 8.9,
    runtime: 154,
    genre: ["Crime", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    backdrop: "",
    overview: "The lives of two mob hitmen, a boxer, a gangster and his wife intertwine in four tales of violence and redemption.",
    director: "Quentin Tarantino",
    cast: ["John Travolta", "Uma Thurman", "Samuel L. Jackson", "Bruce Willis"]
  },
  {
    id: 12,
    title: "Fight Club",
    year: 1999,
    rating: 8.8,
    runtime: 139,
    genre: ["Drama", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    backdrop: "",
    overview: "An insomniac office worker and a devil-may-care soap maker form an underground fight club that evolves into something much more.",
    director: "David Fincher",
    cast: ["Brad Pitt", "Edward Norton", "Helena Bonham Carter"]
  },
  {
    id: 13,
    title: "Parasite",
    year: 2019,
    rating: 8.5,
    runtime: 132,
    genre: ["Drama", "Thriller", "Comedy"],
    poster: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg",
    overview: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    director: "Bong Joon-ho",
    cast: ["Song Kang-ho", "Choi Woo-shik", "Park So-dam"]
  },
  {
    id: 14,
    title: "Joker",
    year: 2019,
    rating: 8.4,
    runtime: 122,
    genre: ["Crime", "Drama", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/udDclJoHjfjb8Ekgsd4FDteOkCU.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg",
    overview: "In Gotham City, mentally troubled comedian Arthur Fleck is disregarded and mistreated by society, and embarks on a downward spiral of revolution and bloody crime.",
    director: "Todd Phillips",
    cast: ["Joaquin Phoenix", "Robert De Niro", "Zazie Beetz"]
  },
  {
    id: 15,
    title: "Mad Max: Fury Road",
    year: 2015,
    rating: 8.1,
    runtime: 120,
    genre: ["Action", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/hA2ple9q4qnwxp3hKVNhroipsir.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/kqjL17yufvn9OVLyXYpvtyrFfak.jpg",
    overview: "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search for her homeland with the aid of a group of female prisoners and a drifter named Max.",
    director: "George Miller",
    cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"]
  },
  {
    id: 16,
    title: "Avengers: Endgame",
    year: 2019,
    rating: 8.4,
    runtime: 181,
    genre: ["Action", "Adventure", "Sci-Fi"],
    poster: "https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    backdrop: "https://image.tmdb.org/t/p/original/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg",
    overview: "After the devastating events of Infinity War, the remaining Avengers assemble once more to reverse Thanos' actions and restore balance to the universe.",
    director: "Anthony & Joe Russo",
    cast: ["Robert Downey Jr.", "Chris Evans", "Scarlett Johansson", "Chris Hemsworth"]
  },
  {
    id: 17,
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    rating: 8.4,
    runtime: 117,
    genre: ["Animation", "Action", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    backdrop: "",
    overview: "Teen Miles Morales becomes the Spider-Man of his universe and must join with five spider-powered individuals from other dimensions to stop a threat for all realities.",
    director: "Bob Persichetti & Peter Ramsey",
    cast: ["Shameik Moore", "Jake Johnson", "Hailee Steinfeld"]
  },
  {
    id: 18,
    title: "Toy Story",
    year: 1995,
    rating: 8.3,
    runtime: 81,
    genre: ["Animation", "Comedy", "Adventure"],
    poster: "https://image.tmdb.org/t/p/w500/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg",
    backdrop: "",
    overview: "A cowboy doll is profoundly threatened and jealous when a new spaceman action figure supplants him as top toy in a boy's bedroom.",
    director: "John Lasseter",
    cast: ["Tom Hanks", "Tim Allen", "Don Rickles"]
  },
  {
    id: 19,
    title: "Coco",
    year: 2017,
    rating: 8.4,
    runtime: 105,
    genre: ["Animation", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg",
    backdrop: "",
    overview: "Aspiring musician Miguel enters the Land of the Dead to find his great-great-grandfather, a legendary singer.",
    director: "Lee Unkrich",
    cast: ["Anthony Gonzalez", "Gael García Bernal", "Benjamin Bratt"]
  },
  {
    id: 20,
    title: "Spirited Away",
    year: 2001,
    rating: 8.6,
    runtime: 125,
    genre: ["Animation", "Adventure", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    backdrop: "",
    overview: "During her family's move to the suburbs, a sullen 10-year-old girl wanders into a world ruled by gods, witches and spirits.",
    director: "Hayao Miyazaki",
    cast: ["Rumi Hiiragi", "Miyu Irino", "Mari Natsuki"]
  },
  {
    id: 21,
    title: "Titanic",
    year: 1997,
    rating: 7.9,
    runtime: 195,
    genre: ["Romance", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg",
    backdrop: "",
    overview: "A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic.",
    director: "James Cameron",
    cast: ["Leonardo DiCaprio", "Kate Winslet", "Billy Zane"]
  },
  {
    id: 22,
    title: "La La Land",
    year: 2016,
    rating: 8.0,
    runtime: 128,
    genre: ["Romance", "Drama", "Comedy"],
    poster: "https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg",
    backdrop: "",
    overview: "While navigating their careers in Los Angeles, a pianist and an actress fall in love while attempting to reconcile their aspirations for the future.",
    director: "Damien Chazelle",
    cast: ["Ryan Gosling", "Emma Stone", "John Legend"]
  },
  {
    id: 23,
    title: "Her",
    year: 2013,
    rating: 8.0,
    runtime: 126,
    genre: ["Romance", "Sci-Fi", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/nR4LD4ZJg2n6LZQpcOrLFdMq0cD.jpg",
    backdrop: "",
    overview: "In a near future, a lonely writer develops an unlikely relationship with an operating system designed to meet his every need.",
    director: "Spike Jonze",
    cast: ["Joaquin Phoenix", "Scarlett Johansson", "Amy Adams"]
  },
  {
    id: 24,
    title: "Get Out",
    year: 2017,
    rating: 7.8,
    runtime: 104,
    genre: ["Horror", "Thriller"],
    poster: "https://image.tmdb.org/t/p/w500/tFXcEccSQMf3lfhfXKSU9iRBpa3.jpg",
    backdrop: "",
    overview: "A young African-American visits his white girlfriend's parents for the weekend, where his simmering uneasiness about their reception of him eventually reaches a boiling point.",
    director: "Jordan Peele",
    cast: ["Daniel Kaluuya", "Allison Williams", "Bradley Whitford"]
  },
  {
    id: 25,
    title: "A Quiet Place",
    year: 2018,
    rating: 7.5,
    runtime: 90,
    genre: ["Horror", "Thriller", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/nAU74GmpUk7t5iklEp3bufwDq4n.jpg",
    backdrop: "",
    overview: "A family struggles for survival in a world where most humans have been killed by blind but noise-sensitive creatures.",
    director: "John Krasinski",
    cast: ["Emily Blunt", "John Krasinski", "Millicent Simmonds"]
  },
  {
    id: 26,
    title: "Jurassic Park",
    year: 1993,
    rating: 8.2,
    runtime: 127,
    genre: ["Adventure", "Sci-Fi", "Action"],
    poster: "https://image.tmdb.org/t/p/w500/oU7Oq2kFAAlGqbU4VoAE36g4hoI.jpg",
    backdrop: "",
    overview: "A pragmatic paleontologist touring an almost complete theme park on an island is tasked with protecting a couple of kids after a power failure causes the park's cloned dinosaurs to run loose.",
    director: "Steven Spielberg",
    cast: ["Sam Neill", "Laura Dern", "Jeff Goldblum"]
  },
  {
    id: 27,
    title: "The Lion King",
    year: 1994,
    rating: 8.5,
    runtime: 88,
    genre: ["Animation", "Adventure", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/sKCr78MXSLixwmZ8DyJLrpMsd15.jpg",
    backdrop: "",
    overview: "Lion prince Simba and his father are targeted by his bitter uncle, who wants to ascend the throne himself.",
    director: "Roger Allers & Rob Minkoff",
    cast: ["Matthew Broderick", "Jeremy Irons", "James Earl Jones"]
  },
  {
    id: 28,
    title: "Forrest Gump",
    year: 1994,
    rating: 8.8,
    runtime: 142,
    genre: ["Drama", "Romance", "Comedy"],
    poster: "https://image.tmdb.org/t/p/w500/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    backdrop: "",
    overview: "The history of the United States from the 1950s to the '70s unfolds from the perspective of an Alabama man with an IQ of 75.",
    director: "Robert Zemeckis",
    cast: ["Tom Hanks", "Robin Wright", "Gary Sinise"]
  },
  {
    id: 29,
    title: "Avatar",
    year: 2009,
    rating: 7.9,
    runtime: 162,
    genre: ["Action", "Adventure", "Sci-Fi"],
    poster: "https://image.tmdb.org/t/p/w500/jRXYjXNq0Cs2TcJjLkki24MLp7u.jpg",
    backdrop: "",
    overview: "A paraplegic Marine dispatched to the moon Pandora on a unique mission becomes torn between following his orders and protecting the world he feels is his home.",
    director: "James Cameron",
    cast: ["Sam Worthington", "Zoe Saldana", "Sigourney Weaver"]
  },
  {
    id: 30,
    title: "Gladiator",
    year: 2000,
    rating: 8.5,
    runtime: 155,
    genre: ["Action", "Adventure", "Drama"],
    poster: "https://image.tmdb.org/t/p/w500/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg",
    backdrop: "",
    overview: "A former Roman General sets out to exact vengeance against the corrupt emperor who murdered his family and sent him into slavery.",
    director: "Ridley Scott",
    cast: ["Russell Crowe", "Joaquin Phoenix", "Connie Nielsen"]
  }
];

/* All genres offered by MovieSuggest */
const GENRES = ["Action", "Bollywood", "Hollywood", "Adventure", "Comedy", "Drama", "Horror", "Romance", "Thriller", "Animation", "Crime"];

/* (Genre cards are plain text — no icons needed) */

/* Movie ids shown in the home-page rows.
   Later these lists come from the backend:
   GET /api/movies?sort=trending | popular | top_rated */
const TRENDING_IDS = [1, 13, 2, 16, 14, 8, 17, 12];
const POPULAR_IDS = [1, 16, 2, 13, 3, 4, 29, 21, 11, 28, 15, 27];
const TOP_RATED_IDS = [9, 10, 3, 11, 12, 2, 1, 20];

/* Dummy recommendation rules: "because you liked X → suggest these".
   Later replaced by GET /api/recommendations/<id> from the
   Python recommendation engine. */
const RECOMMENDED_BECAUSE = [
  { becauseId: 1, ids: [4, 5, 6, 7, 8, 2] },      // Interstellar → The Martian, Gravity, Arrival, Ad Astra, Blade Runner 2049, Inception
  { becauseId: 13, ids: [14, 11, 12, 3, 24] },    // Parasite → Joker, Pulp Fiction, Fight Club, Dark Knight, Get Out
  { becauseId: 17, ids: [18, 19, 20, 27, 15] },   // Spider-Verse → Toy Story, Coco, Spirited Away, Lion King, Mad Max
  { becauseId: 3, ids: [14, 11, 2, 30, 24] }      // Dark Knight → Joker, Pulp Fiction, Inception, Gladiator, Get Out
];

// Expose the existing prototype catalog for a graceful frontend fallback if
// the Flask server is temporarily unavailable.
window.MOVIES = MOVIES;
window.GENRES = GENRES;
window.TRENDING_IDS = TRENDING_IDS;
window.POPULAR_IDS = POPULAR_IDS;
window.TOP_RATED_IDS = TOP_RATED_IDS;
