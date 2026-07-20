class Job {
  final String id;
  final String status;
  final String contentType;
  final String? productName;
  final String? productResearch;
  final String? draftScript;
  final String? approvedScript;
  final String? imageModel;
  final String? videoModel;
  final String? imageUrl;
  final String? finalVideoUrl;
  final String? errorMessage;
  final DateTime createdAt;

  const Job({
    required this.id,
    required this.status,
    this.contentType = 'ugc_selfie',
    this.productName,
    this.productResearch,
    this.draftScript,
    this.approvedScript,
    this.imageModel,
    this.videoModel,
    this.imageUrl,
    this.finalVideoUrl,
    this.errorMessage,
    required this.createdAt,
  });

  factory Job.fromJson(Map<String, dynamic> json) => Job(
        id: json['id'] as String,
        status: json['status'] as String,
        contentType: (json['content_type'] as String?) ?? 'ugc_selfie',
        productName: json['product_name'] as String?,
        productResearch: json['product_research'] as String?,
        draftScript: json['draft_script'] as String?,
        approvedScript: json['approved_script'] as String?,
        imageModel: json['image_model'] as String?,
        videoModel: json['video_model'] as String?,
        imageUrl: json['image_url'] as String?,
        finalVideoUrl: json['final_video_url'] as String?,
        errorMessage: json['error_message'] as String?,
        createdAt: DateTime.parse(json['created_at'] as String),
      );

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get needsScriptApproval => status == 'awaiting_script_approval';
  bool get isProcessing => !isCompleted && !isFailed && !needsScriptApproval;
  bool get isVideo => const [
        'ugc_selfie', 'ugc_walking', 'ugc_car',
        'unboxing', 'testimonial', 'grwm', 'story',
        'lifestyle', 'product_demo', 'text_animation',
      ].contains(contentType);

  // 0–6 for the pipeline stepper
  int get statusStep => switch (status) {
        'pending' => 0,
        'researching_product' => 1,
        'writing_script' || 'awaiting_script_approval' => 2,
        'generating_image' || 'generating_images' => 3,
        'analyzing_image' || 'breaking_scenes' => 4,
        'generating_clips' => 4,
        'stitching' || 'compositing' => 5,
        'completed' => 6,
        _ => 0,
      };

  String get statusLabel => switch (status) {
        'pending' => 'Sıraya alındı',
        'researching_product' => 'Ürün araştırılıyor',
        'writing_script' => 'Senaryo yazılıyor',
        'awaiting_script_approval' => 'Onayınızı bekliyor',
        'generating_image' || 'generating_images' => 'Görsel oluşturuluyor',
        'analyzing_image' => 'Görsel analiz ediliyor',
        'breaking_scenes' => 'Sahneler hazırlanıyor',
        'generating_clips' => 'Video klipleri oluşturuluyor',
        'stitching' || 'compositing' => 'Klipler birleştiriliyor',
        'completed' => 'Tamamlandı',
        'failed' => 'Hata oluştu',
        _ => status,
      };

  String get contentTypeLabel => switch (contentType) {
        'ugc_selfie' => 'UGC Selfie',
        'ugc_walking' => 'UGC Yürüyüş',
        'ugc_car' => 'UGC Araba',
        'unboxing' => 'Kutu Açılımı',
        'testimonial' => 'Müşteri Yorumu',
        'grwm' => 'GRWM',
        'story' => 'Hikâye / Vlog',
        'lifestyle' => 'Lifestyle',
        'product_demo' => 'Ürün Demo',
        'text_animation' => 'Metin Animasyonu',
        'meme' => 'Meme',
        'product_shot' => 'Ürün Fotoğrafı',
        'before_after' => 'Önce / Sonra',
        _ => contentType,
      };
}
