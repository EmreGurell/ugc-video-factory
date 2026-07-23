import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { ContentType, VoiceLanguage } from '../jobs/dto/create-job.dto';

export type JobStatus =
  | 'pending'
  | 'researching_product'
  | 'writing_script'
  | 'awaiting_script_approval'
  | 'generating_image'
  | 'generating_images'
  | 'analyzing_image'
  | 'breaking_scenes'
  | 'generating_clips'
  | 'stitching'
  | 'compositing'
  | 'completed'
  | 'failed';

export interface Scene {
  text: string;
  motion_prompt: string;
  duration: number;
  /** story tipi: sahneye özel mekân/aksiyon görsel prompt'u (İngilizce) */
  image_prompt?: string;
  /** story tipi: bu sahne için üretilen görselin URL'i */
  image_url?: string;
  /** bu sahnede kullanılacak referans kütüphanesi etiketi (varsa) */
  reference_tag?: string;
}

export interface ReferencePhoto {
  id: string;
  user_id: string;
  organization_id: string;
  tag: string;
  url: string;
  description?: string;
  created_at: Date;
}

export interface Job {
  id: string;
  user_id: string;
  organization_id: string;
  status: JobStatus;
  content_type: ContentType;
  product_name?: string;
  video_brief?: string;
  product_research?: string;
  draft_script?: string;
  approved_script?: string;
  prompt_character?: string;
  prompt_script?: string;
  aspect_ratio: string;
  scene_count: number;
  video_style: 'calm' | 'dynamic';
  voice_language: VoiceLanguage;
  voice_gender: 'female' | 'male';
  reference_image_url?: string;
  reference_tags?: string[];
  music_mode?: 'none' | 'library' | 'ai';
  music_style?: string;
  image_model?: string;
  video_model?: string;
  image_url?: string;
  scenes?: Scene[];
  clip_urls?: string[];
  final_video_url?: string;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  organization_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at?: Date | null;
  created_at: Date;
}

export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  created_at: Date;
}

export interface Organization {
  id: string;
  name: string;
  active_plan_id?: string | null;
  credits_remaining: number;
  credits_period_start?: Date | null;
  revenuecat_app_user_id?: string | null;
  created_at: Date;
}

export type MembershipRole = 'owner' | 'member';

export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  created_at: Date;
}

export interface MembershipWithEmail extends Membership {
  email: string;
}

@Injectable()
export class DatabaseService {
  constructor(private prisma: PrismaService) {}

  // ─── Kullanıcılar ───────────────────────────────────────────────────────

  async createUser(data: { email: string; password_hash: string }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // ─── Organizasyonlar/üyelikler ──────────────────────────────────────────

  // Yeni kullanıcı kaydında çağrılır: kişisel bir organizasyon + owner üyeliği oluşturur.
  async createPersonalOrganization(userId: string, name: string): Promise<Organization> {
    const org = await this.prisma.organization.create({ data: { name } });
    await this.prisma.membership.create({
      data: { organization_id: org.id, user_id: userId, role: 'owner' },
    });
    return org;
  }

  // Bir kullanıcının varsayılan (en eski/kişisel) organizasyonunu döner —
  // register/login sırasında JWT'ye gömülecek başlangıç active_org_id için kullanılır.
  async getDefaultOrganizationId(userId: string): Promise<string> {
    const membership = await this.prisma.membership.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
    });
    if (!membership) throw new NotFoundException('Kullanıcının bir organizasyonu yok');
    return membership.organization_id;
  }

  async findMembership(userId: string, organizationId: string): Promise<Membership | null> {
    return this.prisma.membership.findUnique({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    }) as unknown as Membership | null;
  }

  async countMembershipsForUser(userId: string): Promise<number> {
    return this.prisma.membership.count({ where: { user_id: userId } });
  }

  async createMembership(organizationId: string, userId: string, role: MembershipRole): Promise<Membership> {
    return this.prisma.membership.create({
      data: { organization_id: organizationId, user_id: userId, role },
    }) as unknown as Membership;
  }

  async deleteMembership(organizationId: string, userId: string): Promise<void> {
    await this.prisma.membership.delete({
      where: { organization_id_user_id: { organization_id: organizationId, user_id: userId } },
    });
  }

  async listMembershipsForOrg(organizationId: string): Promise<MembershipWithEmail[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { organization_id: organizationId },
      include: { user: { select: { email: true } } },
      orderBy: { created_at: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.id,
      organization_id: m.organization_id,
      user_id: m.user_id,
      role: m.role as MembershipRole,
      created_at: m.created_at,
      email: m.user.email,
    }));
  }

  // ─── Refresh token'lar ──────────────────────────────────────────────────

  async createRefreshToken(data: {
    user_id: string;
    organization_id: string;
    token_hash: string;
    expires_at: Date;
  }): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  async findValidRefreshToken(token_hash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findFirst({
      where: { token_hash, revoked_at: null, expires_at: { gt: new Date() } },
    });
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await this.prisma.refreshToken.update({ where: { id }, data: { revoked_at: new Date() } });
  }

  // ─── Job'lar ────────────────────────────────────────────────────────────

  async createJob(data: {
    user_id: string;
    organization_id: string;
    product_name?: string;
    video_brief?: string;
    prompt_character?: string;
    prompt_script?: string;
    aspect_ratio: string;
    content_type: ContentType;
    scene_count: number;
    video_style: 'calm' | 'dynamic';
    voice_language: VoiceLanguage;
    voice_gender: 'female' | 'male';
    reference_image_url?: string;
    reference_tags?: string[];
    music_mode?: 'none' | 'library' | 'ai';
    music_style?: string;
    image_model?: string;
    video_model?: string;
  }): Promise<Job> {
    const job = await this.prisma.job.create({ data });
    return job as unknown as Job;
  }

  // Kuyruk işleyicisi (JobsProcessor/PipelineService) tarafından kullanılır —
  // jobId zaten sahiplik kontrolünden geçmiş bir create/approve çağrısından gelir.
  async getJob(id: string): Promise<Job> {
    const job = await this.prisma.job.findUniqueOrThrow({ where: { id } });
    return job as unknown as Job;
  }

  // HTTP katmanı için sahiplik kontrollü erişim — organizasyon bazlı,
  // organizasyondaki tüm üyeler birbirinin job'larını görebilir.
  async getJobForOrg(id: string, organizationId: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({ where: { id, organization_id: organizationId } });
    if (!job) throw new NotFoundException('Job not found');
    return job as unknown as Job;
  }

  async listJobsForOrg(organizationId: string): Promise<Job[]> {
    const jobs = await this.prisma.job.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    return jobs as unknown as Job[];
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<void> {
    await this.prisma.job.update({
      where: { id },
      data: updates as unknown as Prisma.JobUpdateInput,
    });
  }

  async updateStatus(id: string, status: JobStatus): Promise<void> {
    await this.updateJob(id, { status });
  }

  // ─── Referans fotoğraf kütüphanesi ─────────────────────────────────────────

  async listReferencePhotos(organizationId: string): Promise<ReferencePhoto[]> {
    const photos = await this.prisma.referencePhoto.findMany({
      where: { organization_id: organizationId },
      orderBy: { created_at: 'desc' },
    });
    return photos as unknown as ReferencePhoto[];
  }

  async getReferencePhotosByTags(tags: string[], organizationId: string): Promise<ReferencePhoto[]> {
    if (tags.length === 0) return [];
    const photos = await this.prisma.referencePhoto.findMany({
      where: { tag: { in: tags }, organization_id: organizationId },
    });
    return photos as unknown as ReferencePhoto[];
  }

  // Bir etiket (klasör) birden fazla öğe tutabilir — her çağrı yeni bir satır ekler
  async insertReferencePhoto(photo: {
    user_id: string;
    organization_id: string;
    tag: string;
    url: string;
    description?: string;
  }): Promise<ReferencePhoto> {
    const created = await this.prisma.referencePhoto.create({ data: photo });
    return created as unknown as ReferencePhoto;
  }

  // Bir etikete ait TÜM öğeleri siler (klasörü tamamen kaldırır)
  async deleteReferencesByTag(tag: string, organizationId: string): Promise<void> {
    await this.prisma.referencePhoto.deleteMany({ where: { tag, organization_id: organizationId } });
  }

  // Klasördeki tek bir öğeyi siler
  async deleteReferencePhotoById(id: string, organizationId: string): Promise<void> {
    const { count } = await this.prisma.referencePhoto.deleteMany({
      where: { id, organization_id: organizationId },
    });
    if (count === 0) throw new NotFoundException('Reference not found');
  }

  // ─── Push bildirim cihaz token'ları ────────────────────────────────────────

  // Token upsert edilir: aynı cihaz farklı bir kullanıcıyla giriş yaparsa
  // (paylaşımlı cihaz/yeniden yükleme) token otomatik olarak yeni kullanıcıya taşınır.
  async registerDeviceToken(userId: string, token: string, platform: string): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      create: { user_id: userId, token, platform },
      update: { user_id: userId, platform },
    });
  }

  async listDeviceTokensForUser(userId: string): Promise<DeviceToken[]> {
    return this.prisma.deviceToken.findMany({ where: { user_id: userId } });
  }

  async deleteDeviceTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }
}
