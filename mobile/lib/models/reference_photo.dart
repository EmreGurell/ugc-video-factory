class ReferencePhoto {
  final String id;
  final String tag;
  final String url;
  final String? description;

  const ReferencePhoto({
    required this.id,
    required this.tag,
    required this.url,
    this.description,
  });

  factory ReferencePhoto.fromJson(Map<String, dynamic> json) => ReferencePhoto(
        id: json['id'] as String,
        tag: json['tag'] as String,
        url: json['url'] as String,
        description: json['description'] as String?,
      );
}
