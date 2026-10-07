// Server-rendered presentation copy. Media is populated only by the API.
export const mockData = {
  title: 'TTSave — Online TikTok Video Downloader',
  availability:
    'Publicly accessible TikTok video links are supported. Available quality depends on the source.',
  result: null,
  progress: null,
  stepImageSizes: '(max-width: 600px) 100vw, 30vw',
  heroArtwork: {
    alt: 'Lifestyle photograph of an adult creator at golden-hour beach sunset',
    creator: '@jenniee',
    caption: 'Sunset vibes ✨',
    label: '♫ original sound · jenniee',
  },
  features: [
    {
      icon: 'link',
      image: 'video-card',
      color: 'pink',
      title: 'Simple Link',
      description:
        'Paste a supported TikTok link and prepare the video in a clear flow.',
    },
    {
      icon: 'eye',
      image: 'available-quality',
      color: 'blue',
      title: 'Available Quality',
      description:
        'Choose from the resolutions and formats provided by the source.',
    },
    {
      icon: 'shield',
      image: null,
      color: 'violet',
      title: 'Public Videos',
      description: 'Process supported, publicly accessible TikTok video links.',
    },
    {
      icon: 'device',
      image: 'mobile-friendly',
      color: 'cyan',
      title: 'All Devices',
      description:
        'Designed for modern phones, tablets, laptops and desktop browsers.',
    },
  ],
  steps: [
    {
      image: 'copy-link-step',
      title: 'Copy a public link',
      description:
        'Open a public TikTok video, tap Share, then select Copy link.',
    },
    {
      image: 'paste-link-step',
      title: 'Paste it into TTSave',
      description: 'Paste the link into the downloader and select Get video.',
    },
    {
      image: 'download-video-step',
      title: 'Choose an available quality',
      description:
        'Review the source details, choose an available option and download the MP4.',
    },
  ],
  faqs: [
    {
      question: 'How do I copy a TikTok video link?',
      answer:
        'Open TikTok and navigate to any public video. Tap the Share button (arrow icon), then choose Copy link. The link is now on your clipboard ready to paste into TTSave.',
    },
    {
      question: 'Which TikTok links are supported?',
      answer:
        'TTSave supports publicly accessible TikTok video links only. Private posts, content behind a login, and regionally restricted videos cannot be processed.',
    },
    {
      question: 'Which qualities are available?',
      answer:
        'Available resolutions depend on the source video. TTSave shows only the formats the source actually provides — no invented quality claims or upscaling.',
    },
    {
      question: 'Where will the downloaded file be saved?',
      answer:
        'Your browser controls where files are saved. Depending on your device and browser settings, the file may go to your Downloads folder or directly to your gallery.',
    },
    {
      question: 'Can private videos be downloaded?',
      answer:
        'No. TTSave only processes publicly accessible TikTok video links. Private-video access, login bypasses, cookies and regional restriction workarounds are not supported.',
    },
    {
      question: 'Does TTSave work on iPhone and Android?',
      answer:
        'Yes. TTSave is designed for modern phones, tablets, laptops and desktop browsers. The interface adapts to every screen size.',
    },
    {
      question: 'Does TTSave improve the original quality?',
      answer:
        'No. TTSave does not upscale, restore or improve video quality. Available formats and resolutions depend on what the source actually provides.',
    },
    {
      question: 'Is TTSave affiliated with TikTok?',
      answer:
        'No. TTSave is an independent tool and is not affiliated with, endorsed by, or connected to TikTok or ByteDance in any way.',
    },
  ],
};
