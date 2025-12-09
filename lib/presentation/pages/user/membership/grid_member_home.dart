import 'package:carousel_slider/carousel_slider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

import '../../../../core/di/dependency_injection.dart';
import '../../../../data/models/dto/membership_dto.dart';
import '../../../bloc/common/bloc_status.dart';
import '../../../bloc/membership/membership_bloc.dart';
import '../../../bloc/membership/membership_event.dart';
import '../../../bloc/membership/membership_state.dart';
import '../../../widgets/member-ships/detail_membership.dart';
import '../../../widgets/member-ships/grid_membership.dart';

/// Simple image carousel for membership section on HomePage
class MembershipCarouselHome extends StatefulWidget {
  const MembershipCarouselHome({super.key});

  @override
  State<MembershipCarouselHome> createState() => _MembershipCarouselHomeState();
}

class _MembershipCarouselHomeState extends State<MembershipCarouselHome> {
  final CarouselSliderController _carouselController =
      CarouselSliderController();
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => serviceLocator<MembershipBloc>()
        ..add(
          const MembershipsRequested(
            query: MembershipQueryDto(limit: 6, status: 'active'),
          ),
        ),
      child: BlocBuilder<MembershipBloc, MembershipState>(
        builder: (context, state) {
          if (state.status.isLoading && state.items.isEmpty) {
            return const SizedBox(
              height: 180,
              child: Center(child: CircularProgressIndicator()),
            );
          }

          if (state.items.isEmpty) {
            return const SizedBox(
              height: 180,
              child: Center(
                child: Text(
                  'Chưa có hạng thành viên',
                  style: TextStyle(color: Colors.black54),
                ),
              ),
            );
          }

          return Column(
            children: [
              // Carousel
              CarouselSlider.builder(
                carouselController: _carouselController,
                itemCount: state.items.length,
                options: CarouselOptions(
                  height: 180,
                  viewportFraction: 0.85,
                  enlargeCenterPage: true,
                  enlargeFactor: 0.15,
                  enableInfiniteScroll: state.items.length > 1,
                  autoPlay: true,
                  autoPlayInterval: const Duration(seconds: 5),
                  autoPlayAnimationDuration: const Duration(milliseconds: 800),
                  onPageChanged: (index, _) =>
                      setState(() => _currentIndex = index),
                ),
                itemBuilder: (context, index, realIndex) {
                  final item = state.items[index];
                  final imageUrl = _resolveImageUrl(item.image);
                  final isActive = index == _currentIndex;

                  return GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => MembershipDetailPage(
                          itemId: item.id,
                          prefetched: item,
                        ),
                      ),
                    ),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      margin: EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: isActive ? 0 : 8,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(
                              isActive ? 0.2 : 0.1,
                            ),
                            blurRadius: isActive ? 12 : 6,
                            offset: Offset(0, isActive ? 6 : 3),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            // Gradient background
                            Container(
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    Color(0xFF667eea),
                                    Color(0xFF764ba2),
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
                                    Icons.workspace_premium_outlined,
                                    color: Colors.white,
                                    size: 48,
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
                                  Icons.workspace_premium_outlined,
                                  color: Colors.white,
                                  size: 48,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
              // Indicators
              const SizedBox(height: 12),
              AnimatedSmoothIndicator(
                activeIndex: _currentIndex,
                count: state.items.length,
                effect: ExpandingDotsEffect(
                  dotHeight: 8,
                  dotWidth: 8,
                  spacing: 6,
                  activeDotColor: Colors.teal,
                  dotColor: Colors.grey.withOpacity(0.3),
                  expansionFactor: 3,
                ),
                onDotClicked: (index) =>
                    _carouselController.animateToPage(index),
              ),
              // "Xem thêm" button
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const MembershipGridPage()),
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
