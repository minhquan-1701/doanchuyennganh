import 'package:flutter/material.dart';

import '../../../core/di/dependency_injection.dart';
import '../../../data/models/dto/movie_dto.dart';
import '../../../data/models/entity/movie_entity.dart';
import '../../../domain/services/movie_service.dart';
import 'comingsoon/grid_movies_comingsoon.dart';
import 'comingsoon/list_movies_comingsoon.dart';
import 'detail/movie_detail_screen.dart';
import 'nowshowing/grid_movies_nowshow.dart';
import 'nowshowing/list_movies_nowshow.dart';

/// Movies section for HomePage - displays Now Showing and Coming Soon
/// This is the body content extracted from MoviesPage (without Scaffold/AppBar)
class MoviesHomeWidget extends StatefulWidget {
  const MoviesHomeWidget({super.key});

  @override
  State<MoviesHomeWidget> createState() => _MoviesHomeWidgetState();
}

class _MoviesHomeWidgetState extends State<MoviesHomeWidget> {
  late final MovieService _movieService;
  List<MovieEntity> _nowShowing = const [];
  List<MovieEntity> _comingSoon = const [];
  bool _isLoadingNow = true;
  bool _isLoadingComing = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _movieService = serviceLocator<MovieService>();
    _fetchMovies();
  }

  Future<void> _fetchMovies() async {
    setState(() {
      _isLoadingNow = true;
      _isLoadingComing = true;
      _error = null;
    });

    try {
      final results = await Future.wait([
        _movieService.getMovies(
          const MovieQueryDto(status: 'now showing', limit: 10),
        ),
        _movieService.getMovies(
          const MovieQueryDto(status: 'coming soon', limit: 10),
        ),
      ]);

      setState(() {
        _nowShowing = results[0].items;
        _comingSoon = results[1].items;
        _isLoadingNow = false;
        _isLoadingComing = false;
      });
    } catch (error) {
      setState(() {
        _error = error.toString();
        _isLoadingNow = false;
        _isLoadingComing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // Error state
    if (_error != null) {
      return SizedBox(
        height: 300,
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.error_outline,
                  size: 48,
                  color: Colors.redAccent,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Không thể tải danh sách phim',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  onPressed: _fetchMovies,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Thử lại'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.deepPurpleAccent,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Content: Now Showing + Coming Soon
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section: Now Showing
        if (_isLoadingNow)
          const SizedBox(
            height: 280,
            child: Center(child: CircularProgressIndicator()),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: NowShowingMoviesGrid(
              movies: _mapNowShowing(),
              onBookMovie: _handleMovieTap,
              onMovieTap: _handleMovieTap,
            ),
          ),
        // "Xem tất cả" button for Now Showing
        if (!_isLoadingNow && _nowShowing.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Center(
              child: ElevatedButton.icon(
                onPressed: _openNowShowingList,
                icon: const Icon(Icons.movie_filter_outlined),
                label: const Text('Xem tất cả'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurpleAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ),

        const SizedBox(height: 16),

        // Section: Coming Soon
        ComingSoonMoviesGrid(
          movies: _comingSoon,
          isLoading: _isLoadingComing,
          onMovieTap: _openMovieDetail,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          title: 'PHIM SẮP CHIẾU',
        ),
        // "Xem tất cả" button for Coming Soon
        if (!_isLoadingComing && _comingSoon.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Center(
              child: ElevatedButton.icon(
                onPressed: _openComingSoonList,
                icon: const Icon(Icons.upcoming_outlined),
                label: const Text('Xem tất cả'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.deepPurpleAccent,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 12,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  List<NowShowingMovie> _mapNowShowing() {
    if (_nowShowing.isEmpty) {
      return const [];
    }

    return _nowShowing
        .map(
          (movie) => NowShowingMovie(
            id: movie.id,
            title: movie.title,
            posterUrl: movie.posterImage?.isNotEmpty == true
                ? movie.posterImage!
                : 'https://via.placeholder.com/300x450?text=No+Image',
            genre: movie.language?.isNotEmpty == true ? movie.language! : 'N/A',
            format: movie.subtitle?.isNotEmpty == true ? movie.subtitle! : '2D',
            ageRestriction: movie.ageRestriction?.isNotEmpty == true
                ? movie.ageRestriction!
                : 'P',
          ),
        )
        .toList();
  }

  void _handleMovieTap(NowShowingMovie movie) {
    final entity = _nowShowing.firstWhere((m) => m.id == movie.id);
    _openMovieDetail(entity);
  }

  void _openMovieDetail(MovieEntity movie) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => MovieDetailScreen(movie: movie)),
    );
  }

  void _openNowShowingList() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const NowShowingListPage()),
    );
  }

  void _openComingSoonList() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const ComingSoonListPage()),
    );
  }
}
