// The app-bar title used across the app: the wordmark, then the screen's own name.
//
// This is what makes every screen read as Baytara rather than as a generic list. The
// wordmark is white because every AppBar in this app sits on the brand navy.
import 'package:flutter/material.dart';

class BrandedTitle extends StatelessWidget {
  const BrandedTitle(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Image.asset('assets/brand/wordmark_white.png', height: 21),
          const SizedBox(width: 11),
          Container(
            width: 1,
            height: 17,
            color: Colors.white.withValues(alpha: 0.28),
          ),
          const SizedBox(width: 11),
          Flexible(
            child: Text(
              title,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      );
}
