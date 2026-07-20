import 'reference_photo.dart';

/// Bir etiketin (tag) altındaki tüm öğeleri gruplayan istemci-taraflı model.
/// Backend flat liste döner (`GET /references`); klasör görünümü burada kurulur.
class ReferenceFolder {
  final String tag;
  final List<ReferencePhoto> items;

  const ReferenceFolder({required this.tag, required this.items});

  String get coverUrl => items.first.url;
  int get count => items.length;

  static List<ReferenceFolder> groupByTag(List<ReferencePhoto> photos) {
    final map = <String, List<ReferencePhoto>>{};
    for (final p in photos) {
      map.putIfAbsent(p.tag, () => []).add(p);
    }
    return map.entries
        .map((e) => ReferenceFolder(tag: e.key, items: e.value))
        .toList();
  }
}
