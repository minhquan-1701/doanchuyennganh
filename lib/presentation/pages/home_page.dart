import 'package:flutter/material.dart';

import 'user/entertaiment/grid_enter_home.dart';
import 'user/membership/grid_member_home.dart';
import 'user/promotion/grid_promotion_home.dart';
import '../widgets/movies/movies_home_page.dart';
import 'account_page.dart';
import 'chat_page.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with SingleTickerProviderStateMixin {
  late AnimationController _fabAnimationController;
  late Animation<double> _fabScaleAnimation;
  bool _showText = true;

  @override
  void initState() {
    super.initState();

    // Animation controller for pulsing effect
    _fabAnimationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);

    _fabScaleAnimation = Tween<double>(begin: 0.95, end: 1.05).animate(
      CurvedAnimation(parent: _fabAnimationController, curve: Curves.easeInOut),
    );

    // Toggle text every 3 seconds
    _startTextToggle();
  }

  void _startTextToggle() {
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) {
        setState(() => _showText = !_showText);
        _startTextToggle();
      }
    });
  }

  @override
  void dispose() {
    _fabAnimationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1C0F2E),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(60),
        child: AppBar(
          elevation: 0,
          backgroundColor: Colors.deepPurple,
          foregroundColor: Colors.white,
          flexibleSpace: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Row(
                children: [
                  // Logo
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.2),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.asset(
                        'assets/images/alexcinema_2.png',
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          color: Colors.white.withOpacity(0.1),
                          child: const Icon(Icons.movie, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Title and Marquee Text
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Text(
                          'Alex Cinema',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        // Animated Marquee Text
                        SizedBox(
                          height: 20,
                          child: _MarqueeText(
                            text:
                                '🎬 Đặt vé online - Giá ưu đãi - Trải nghiệm tuyệt vời ⭐',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.9),
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),


                ],
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Trigger refresh for all sections
          await Future.delayed(const Duration(milliseconds: 500));
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              // 1. Promotions Section
              PromotionCarouselHome(),
              SizedBox(height: 24),

              // 2. Movies Section (Now Showing + Coming Soon)
              MoviesHomeWidget(),
              SizedBox(height: 24),

              // 3. Entertainment Section
              EntertainmentGridHome(),
              SizedBox(height: 24),

              // 4. Membership Section
              MembershipCarouselHome(),
              SizedBox(height: 80), // Space for FAB
            ],
          ),
        ),
      ),
      floatingActionButton: _buildAnimatedFAB(),
    );
  }

  Widget _buildAnimatedFAB() {
    return AnimatedBuilder(
      animation: _fabAnimationController,
      builder: (context, child) {
        return Transform.scale(
          scale: _fabScaleAnimation.value,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Animated text label
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                width: _showText ? 120 : 0,
                height: 40,
                curve: Curves.easeInOut,
                child: _showText
                    ? Container(
                        margin: const EdgeInsets.only(right: 8),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF8D4CE8), Color(0xFFB565F5)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.deepPurple.withOpacity(0.4),
                              blurRadius: 12,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: Text(
                            'Đặt vé ngay',
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              // FAB with avatar
              FloatingActionButton(
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ChatPage()),
                ),
                backgroundColor: Colors.deepPurple,
                elevation: 20,
                child: Container(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.white.withOpacity(0.3),
                        blurRadius: 8,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: const CircleAvatar(
                    radius: 60,
                    backgroundImage: AssetImage(
                      'assets/images/avatarchatbox.jpg',
                    ),
                    backgroundColor: Colors.transparent,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ==========================================
// MARQUEE TEXT WIDGET
// ==========================================

/// Animated scrolling text widget
class _MarqueeText extends StatefulWidget {
  const _MarqueeText({required this.text, required this.style});

  final String text;
  final TextStyle style;

  @override
  State<_MarqueeText> createState() => _MarqueeTextState();
}

class _MarqueeTextState extends State<_MarqueeText>
    with SingleTickerProviderStateMixin {
  late ScrollController _scrollController;
  late AnimationController _animationController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _animationController = AnimationController(
      duration: const Duration(seconds: 10),
      vsync: this,
    )..repeat();

    _animationController.addListener(_scroll);
  }

  void _scroll() {
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.offset;

      if (currentScroll >= maxScroll) {
        _scrollController.jumpTo(0);
      } else {
        _scrollController.jumpTo(currentScroll + 1);
      }
    }
  }

  @override
  void dispose() {
    _animationController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      controller: _scrollController,
      scrollDirection: Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      itemBuilder: (context, index) {
        return Padding(
          padding: const EdgeInsets.only(right: 40),
          child: Text(widget.text, style: widget.style),
        );
      },
    );
  }
}
