import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../../../../core/di/dependency_injection.dart';
import '../../../../data/models/dto/entertainment_dto.dart';
import '../../../bloc/common/bloc_status.dart';
import '../../../bloc/entertainment/entertainment_bloc.dart';
import '../../../bloc/entertainment/entertainment_event.dart';
import '../../../bloc/entertainment/entertainment_state.dart';
import '../../../widgets/entertaiments/detail_entertaimet.dart';
import '../../../widgets/entertaiments/grid_entertaiment.dart';

/// Simple image grid for entertainment section on HomePage
class EntertainmentGridHome extends StatelessWidget {
  const EntertainmentGridHome({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => serviceLocator<EntertainmentBloc>()
        ..add(
          const EntertainmentRequested(
            query: EntertainmentQueryDto(limit: 4, status: 'active'),
          ),
        ),
      child: BlocBuilder<EntertainmentBloc, EntertainmentState>(
        builder: (context, state) {
          if (state.status.isLoading && state.items.isEmpty) {
            return const SizedBox(
              height: 200,
              child: Center(child: CircularProgressIndicator()),
            );
          }

          if (state.items.isEmpty) {
            return const SizedBox(
              height: 200,
              child: Center(
                child: Text(
                  'Chưa có sự kiện',
                  style: TextStyle(color: Colors.black54),
                ),
              ),
            );
          }

          return Column(
            children: [
              // Grid of image cards
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.5, // Landscape ratio
                ),
                itemCount: state.items.length > 4 ? 4 : state.items.length,
                itemBuilder: (context, index) {
                  final item = state.items[index];
                  final imageUrl = _resolveImageUrl(item.imageUrl);

                  return GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            EntertainmentDetailPage(itemId: item.id),
                      ),
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.1),
                            blurRadius: 8,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // Background gradient
                            Container(
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Color(0xFFFF6B6B),
                                    Color(0xFFFFB347),
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                              ),
                            ),
                            // Image
                            if (imageUrl != null)
                              Image.network(
                                imageUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(
                                    Icons.celebration_outlined,
                                    color: Colors.white,
                                    size: 40,
                                  ),
                                ),
                                loadingBuilder:
                                    (context, child, loadingProgress) {
                                      if (loadingProgress == null) return child;
                                      return const Center(
                                        child: CircularProgressIndicator(
                                          color: Colors.white,
                                          strokeWidth: 2,
                                        ),
                                      );
                                    },
                              )
                            else
                              const Center(
                                child: Icon(
                                  Icons.celebration_outlined,
                                  color: Colors.white,
                                  size: 40,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
              // "Xem thêm" button
              const SizedBox(height: 16),
              TextButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => const EntertainmentGridPage(),
                  ),
                ),
                icon: const Icon(Icons.grid_view_rounded),
                label: const Text('Xem thêm'),
                style: TextButton.styleFrom(
                  foregroundColor: Colors.deepPurple,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 10,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  String? _resolveImageUrl(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final env = dotenv.env;
    String? base =
        env['FLUTTER_API_URL'] ?? env['API_BASE_URL'] ?? env['BASE_URL'];

    if (raw.startsWith('http')) {
      final isLocal =
          raw.contains('localhost') ||
          raw.contains('127.0.0.1') ||
          raw.contains('10.0.2.2');
      if (isLocal && base != null && base.isNotEmpty) {
        final normalizedBase = _normalizeBase(base);
        return raw.replaceFirst(RegExp(r'^https?://[^/]+'), normalizedBase);
      }
      return raw;
    }

    if (base == null || base.isEmpty) return raw;
    base = _normalizeBase(base);
    if (!raw.startsWith('/')) {
      raw = '/$raw';
    }
    return '$base$raw';
  }

  String _normalizeBase(String base) {
    if (base.endsWith('/')) {
      base = base.substring(0, base.length - 1);
    }
    if (base.toLowerCase().endsWith('/api')) {
      base = base.substring(0, base.length - 4);
    }
    return base;
  }
}
