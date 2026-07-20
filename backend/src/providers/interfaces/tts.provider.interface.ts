import { VoiceLanguage } from '../../jobs/dto/create-job.dto';

export interface TtsParams {
  text: string;
  language: VoiceLanguage;
  gender: 'female' | 'male';
}

export interface TtsProvider {
  synthesize(params: TtsParams): Promise<Buffer>;
}
