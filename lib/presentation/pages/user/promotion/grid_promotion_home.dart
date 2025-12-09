import 'package:carousel_slider/carousel_slider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

import '../../../../core/di/dependency_injection.dart';
import '../../../../data/models/dto/promotion_dto.dart';
import '../../../bloc/common/bloc_status.dart';
import '../../../bloc/promotion/promotion_bloc.dart';
import '../../../bloc/promotion/promotion_event.dart';
import '../../../bloc/promotion/promotion_state.dart';
import '../../../widgets/promotions/detail_promotions.dart';
import '../../../widgets/promotions/grid_promotions.dart';

/// Simple image carousel for promotions section on HomePage
class PromotionCarouselHome extends StatefulWidget {
  const PromotionCarouselHome({super.key});

  @override
  State<PromotionCarouselHome> createState() => _PromotionCarouselHomeState();
}

class _PromotionCarouselHomeState extends State<PromotionCarouselHome> {
  final CarouselSliderController _carouselController =
      CarouselSliderController();
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => serviceLocator<PromotionBloc>()
        ..add(
          const PromotionsRequested(
            query: PromotionQueryDto(limit: 10, status: 'active'),
          ),
        ),
      child: BlocBuilder<PromotionBloc, PromotionState>(
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
                  'Chưa có ưu đãi',
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
                  autoPlayInterval: const Duration(seconds: 4),
                  autoPlayAnimationDuration: const Duration(milliseconds: 800),
                  onPageChanged: (index, _) =>
                      setState(() => _currentIndex = index),
                ),
                itemBuilder: (context, index, realIndex) {
                  final promo = state.items[index];
                  final imageUrl = _resolveImageUrl(promo.image);
                  final isActive = index == _currentIndex;

                  return GestureDetector(
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => PromotionDetailPage(promotion: promo),
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
                                    Color(0xFF8D4CE8),
                                    Color(0xFFB565F5),
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
                                    Icons.card_giftcard_outlined,
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
                                  Icons.card_giftcard_outlined,
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
                  activeDotColor: const Color(0xFF8D4CE8),
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
                  MaterialPageRoute(builder: (_) => const PromotionGridPage()),
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
