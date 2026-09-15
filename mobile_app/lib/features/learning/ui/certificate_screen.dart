// A certificate, and its public verification page.
//
// The same screen serves the holder and anyone they send the serial to. It deliberately
// shows only the learner's name and the course: that is all /certificates/<serial> exposes,
// and the point of the serial is to verify without revealing an account.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/learning_providers.dart';
import '../data/learning_dto.dart';

final certificateProvider = FutureProvider.family<Certificate, String>(
  (ref, serial) => ref.watch(learningRepositoryProvider).verifyCertificate(serial),
);

class CertificateScreen extends ConsumerWidget {
  const CertificateScreen({super.key, required this.serial});
  final String serial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(certificateProvider(serial));

    return Scaffold(
      appBar: AppBar(title: Text(l.certificatesTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(asApiException(e).code.message(l),
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.7)),
          ),
        ),
        data: (c) => _Certificate(certificate: c),
      ),
    );
  }
}

class _Certificate extends StatelessWidget {
  const _Certificate({required this.certificate});
  final Certificate certificate;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final locale = Localizations.localeOf(context).languageCode;
    final formatter = DateFormat.yMMMMd(locale == 'en' ? 'en_US' : 'ar_EG');

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 30),
          decoration: BoxDecoration(
            gradient: BrandGradients.darkPanel,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              const Icon(Icons.workspace_premium,
                  size: 46, color: BrandColors.gold),
              const SizedBox(height: 14),
              Text(l.certificateVerified,
                  style: const TextStyle(
                      color: BrandColors.gold, fontSize: 12.5,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 18),
              Text(certificate.learnerName,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 21,
                      fontWeight: FontWeight.w800, height: 1.5)),
              const SizedBox(height: 10),
              Text(certificate.courseTitle,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.85),
                      fontSize: 14.5, height: 1.7)),
            ],
          ),
        ),
        const SizedBox(height: 22),
        _Row(label: l.certificateHolder, value: certificate.learnerName),
        if (certificate.issuedAt != null)
          _Row(
            label: l.certificateIssued,
            value: formatter.format(certificate.issuedAt!.toLocal()),
          ),
        _Row(label: l.certificateSerial, value: certificate.serial, monospace: true),
        const SizedBox(height: 22),
        // The same PNG the website prints, served by the API rather than drawn here, so a
        // screenshot of this screen and a printed sheet carry an identical code. White
        // plate because a QR needs its light side to stay light.
        Center(
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Image.network(
              '$kApiBaseUrl/certificates/${Uri.encodeComponent(certificate.serial)}/qr.png',
              width: 132,
              height: 132,
              // A missing code must not take the certificate down with it: the serial and
              // the link below are still enough to verify by hand.
              errorBuilder: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
        ),
        const SizedBox(height: 22),
        // The verification URL is the shareable artefact, not a PDF: anyone can open it and
        // confirm the certificate without an account.
        SelectableText(
          certificate.verifyUrl,
          textDirection: TextDirection.ltr,
          style: const TextStyle(fontSize: 12.5, color: BrandColors.accent),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value, this.monospace = false});
  final String label;
  final String value;
  final bool monospace;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 9),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 110,
              child: Text(label,
                  style: const TextStyle(fontSize: 13, color: BrandColors.muted2)),
            ),
            Expanded(
              child: Text(
                value,
                textDirection: monospace ? TextDirection.ltr : null,
                style: TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  fontFamily: monospace ? 'monospace' : null,
                ),
              ),
            ),
          ],
        ),
      );
}
