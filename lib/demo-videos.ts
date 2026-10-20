import type { Place } from './types';

const shareAlike = 'https://creativecommons.org/licenses/by-sa/4.0/';
const recordedAt: Record<string, string> = {
  kivach: '2022-01-30',
  suisaari: '2021-11-14',
  syskyanjoki: '2021-11-02',
  iijoki: '2021-11-03',
  'ruskeala-train': '2023-07-15',
};
function excerpt(id: string, author: string, pageId: number): NonNullable<Place['video']> {
  return {
    sourceType: 'upload',
    playbackUrl: `/media/videos/${id}.mp4`,
    previewUrl: `/media/videos/${id}-preview.mp4`,
    credit: {
      author,
      recordedAt: recordedAt[id],
      rightsBasis: 'open-license',
      sourceUrl: `https://commons.wikimedia.org/w/index.php?curid=${pageId}`,
      license: 'CC BY-SA 4.0',
      licenseUrl: shareAlike,
      changes: 'Фрагмент до 15 с · кадрировано в превью',
    },
  };
}
export const demoVideos: Record<string, NonNullable<Place['video']>> = {
  kivach: excerpt('kivach', 'Avsolov', 114966475),
  suisaari: excerpt('suisaari', '基日島', 112508381),
  syskyanjoki: excerpt('syskyanjoki', '基日島', 112925980),
  iijoki: excerpt('iijoki', '基日島', 112926368),
  'ruskeala-train': excerpt('ruskeala-train', 'Avsolov', 134643586),
  kizhi: {
    sourceType: 'upload',
    playbackUrl: '/media/videos/kizhi.webm',
    credit: {
      author: 'Андрей Крижановский (AKA MBG)',
      authorUrl: 'https://commons.wikimedia.org/wiki/User:AKA_MBG',
      recordedAt: '2022-08-19',
      rightsBasis: 'public-domain',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Chimes_of_Kizhi_2022.webm',
      license: 'Public domain',
      licenseUrl: 'https://commons.wikimedia.org/wiki/File:Chimes_of_Kizhi_2022.webm#Licensing',
    },
  },
  koirinoja: {
    sourceType: 'upload',
    playbackUrl: '/media/videos/koirinoja.webm',
    credit: {
      author: 'Gesellschaftlichnützlichearbeit',
      recordedAt: '2022-11-12',
      rightsBasis: 'open-license',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Unterer_Koyrinoja-Wasserfall.ogg',
      license: 'CC BY-SA 4.0',
      licenseUrl: shareAlike,
    },
  },
};
