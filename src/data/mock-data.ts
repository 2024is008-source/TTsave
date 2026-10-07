// Server-rendered presentation copy. Media is populated only by the API.
export const mockData = {
  title: 'TTSave — A little more worth keeping',
  availability:
    'Analyze publicly accessible TikTok video links. File downloads are not available yet.',
  result: null,
  progress: null,
  stepImageSizes: '(max-width: 600px) 100vw, 30vw',
  heroArtwork: {
    alt: 'Original illustration of an adult travel creator on a coastal trail',
    creator: 'Maya · concept creator',
    caption: 'Coastal walks. Taking the slow way.',
    label: 'Illustrated lifestyle preview',
  },
  features: [
    {
      icon: 'link',
      image: 'video-card',
      color: 'pink',
      title: 'One link. One place.',
      description: 'A focused space for the TikTok videos you want to keep.',
    },
    {
      icon: 'eye',
      image: 'available-quality',
      color: 'blue',
      title: 'Clarity comes first.',
      description:
        'Available formats and source details will come from the video, with no invented quality claims.',
    },
    {
      icon: 'shield',
      image: null,
      color: 'violet',
      title: 'Public links only.',
      description: 'Private posts and content requiring a login will stay private.',
    },
    {
      icon: 'device',
      image: 'mobile-friendly',
      color: 'cyan',
      title: 'Made for your screen.',
      description: 'A considered experience, from your phone to your desktop.',
    },
  ],
  steps: [
    {
      image: 'copy-link-step',
      title: 'Copy a public link',
      description: 'Open a publicly accessible TikTok video. Tap Share, then Copy link.',
    },
    {
      image: 'paste-link-step',
      title: 'Bring it to TTSave',
      description:
        'Paste the link into the field above. Only public TikTok video links are accepted.',
    },
    {
      image: 'download-video-step',
      title: 'Choose what is available',
      description:
        'When downloads launch, review the source details and choose an available video format.',
    },
  ],
  faqs: [
    {
      question: 'Can I download a video right now?',
      answer:
        'Not yet. This interface supports public video metadata analysis when the server tools are available. Video file downloads are still being built.',
    },
    {
      question: 'Which TikTok links will be supported?',
      answer:
        'Publicly accessible TikTok video links only. TTSave will not bypass private-video access, logins, cookies or regional restrictions.',
    },
    {
      question: 'Will TTSave improve the video quality?',
      answer:
        'No. TTSave will not upscale, restore or improve video quality. Available formats and resolutions will depend on what the source actually provides.',
    },
    {
      question: 'Are watermark-free videos guaranteed?',
      answer:
        'No. Watermark availability depends on the accessible source. TTSave does not guarantee watermark removal.',
    },
    {
      question: 'Where will files be saved?',
      answer:
        'Once downloads are available, your browser will control where a file is saved. TTSave cannot guarantee that it goes directly to a device gallery.',
    },
  ],
};
