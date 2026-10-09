// Server-rendered presentation copy. Media is populated only by the API.
export const mockData = {
  title: 'TikSaveMp4 — Online TikTok Video Downloader',
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
      title: 'MP4 video and MP3 audio',
      description: 'MP4 saves video with audio. MP3 extracts available source audio.',
    },
    {
      icon: 'eye',
      image: 'available-quality',
      color: 'blue',
      title: 'Available Quality',
      description: 'Choose from the resolutions and formats provided by the source.',
    },
    {
      icon: 'shield',
      image: null,
      color: 'violet',
      title: 'Public Videos',
      description:
        'Public video links only. Private, login-required and restricted content is unsupported.',
    },
    {
      icon: 'device',
      image: 'mobile-friendly',
      color: 'cyan',
      title: 'All Devices',
      description: 'Designed for modern phones, tablets, laptops and desktop browsers.',
    },
  ],
  steps: [
    {
      image: 'copy-link-step',
      title: 'Copy link',
      description: 'Open a public TikTok video, tap Share, then select Copy link.',
    },
    {
      image: 'paste-link-step',
      title: 'Paste link',
      description: 'Paste the link into the downloader and select Get video.',
    },
    {
      image: 'download-video-step',
      title: 'Download video',
      description:
        'Review the source details, choose an available MP4 quality or MP3 audio, and download the file.',
    },
  ],
  moments: [
    {
      image: 'hero-video-poster',
      width: 1080,
      height: 1920,
      small: 540,
      icon: 'video',
      color: 'pink',
      title: 'TikTok videos',
      copy: 'Save supported public video posts as MP4, with audio.',
    },
    {
      image: 'moment-nature',
      width: 600,
      height: 800,
      small: 300,
      icon: 'eye',
      color: 'blue',
      title: 'Source quality',
      copy: 'Review the available formats before choosing your download.',
    },
    {
      image: 'moment-city',
      width: 600,
      height: 800,
      small: 300,
      icon: 'device',
      color: 'violet',
      title: 'Your device',
      copy: 'Use your browser on a phone, tablet or computer.',
    },
  ],
  faqs: [
    {
      question: 'How do I convert a TikTok video to MP4?',
      answer:
        'Open a public TikTok video, tap Share and choose Copy link. Paste it into TikSaveMp4 and select Get video. Choose MP4 and an available quality, then download. MP4 saves the video with its source audio.',
    },
    {
      question: 'Can I download TikTok audio as MP3?',
      answer:
        'Yes, when the analyzed public video provides supported source audio, TikSaveMp4 offers MP3. Choose MP3 after analysis to convert TikTok to MP3. Conversion does not improve audio quality or grant music-use rights.',
    },
    {
      question: 'Which TikTok links are supported?',
      answer:
        'TikSaveMp4 supports publicly accessible TikTok video links only. Private posts, content behind a login, and regionally restricted videos cannot be processed.',
    },
    {
      question: 'Why are some video qualities unavailable?',
      answer:
        'Available resolutions depend on the source video. TikSaveMp4 shows only the formats the source actually provides — no invented quality claims or upscaling.',
    },
    {
      question: 'Where will the downloaded file be saved?',
      answer:
        'Your browser controls where files are saved. Check your Downloads folder or the location selected in your browser; saving to your photo library may require a separate action.',
    },
    {
      question: 'Can private TikTok videos be downloaded?',
      answer:
        'No. TikSaveMp4 only processes publicly accessible TikTok video links. Private-video access, login bypasses, cookies and regional restriction workarounds are not supported.',
    },
    {
      question: 'Does downloading give me permission to reuse a video?',
      answer:
        'No. You must have permission to save and reuse the video and its audio. Downloading does not grant ownership, redistribution rights or commercial-use permission. Review the Responsible Use and Copyright pages.',
    },
    {
      question: 'Why might a download fail?',
      answer:
        'A post may be deleted, private, login-required or restricted. Source formats can be unavailable, a network or conversion error can occur, or a request can exceed service limits. Temporary download links also expire. Review the displayed error; some links cannot be processed.',
    },
    {
      question: 'Does TikSaveMp4 store downloaded videos?',
      answer:
        'Files and previews are stored temporarily on the server for processing and delivery. Cleanup runs after delivery or expiry; failures or an interrupted server can delay removal. There is no public video library. The Privacy Policy lists current retention settings and explains logs and backups separately.',
    },
    {
      question: 'Does TikSaveMp4 work on iPhone and Android?',
      answer:
        'Yes. TikSaveMp4 is designed for modern phones, tablets, laptops and desktop browsers. The interface adapts to every screen size.',
    },
    {
      question: 'Does TikSaveMp4 improve the original quality?',
      answer:
        'No. TikSaveMp4 does not upscale, restore or improve video quality. Available formats and resolutions depend on what the source actually provides.',
    },
    {
      question: 'Is TikSaveMp4 affiliated with TikTok?',
      answer:
        'No. TikSaveMp4 is an independent tool and is not affiliated with, endorsed by, or connected to TikTok or ByteDance in any way.',
    },
  ],
};
