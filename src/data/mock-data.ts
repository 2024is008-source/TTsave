// Temporary presentation data. Media stays empty until a real provider exists.
export const mockData = {
  title: 'TTSave — A little more worth keeping',
  availability:
    'Downloads are not available yet. This is a preview of the TTSave interface.',
  result: null,
  progress: null,
  features: [
    {
      icon: 'link',
      color: 'pink',
      title: 'One link. One place.',
      description: 'A focused space for the TikTok videos you want to keep.',
    },
    {
      icon: 'eye',
      color: 'blue',
      title: 'Clarity comes first.',
      description:
        'Available formats and source details will come from the video, with no invented quality claims.',
    },
    {
      icon: 'shield',
      color: 'violet',
      title: 'Public links only.',
      description: 'Private posts and content requiring a login will stay private.',
    },
    {
      icon: 'device',
      color: 'cyan',
      title: 'Made for your screen.',
      description: 'A considered experience, from your phone to your desktop.',
    },
  ],
  steps: [
    {
      title: 'Copy a public link',
      description: 'Open a publicly accessible TikTok video. Tap Share, then Copy link.',
    },
    {
      title: 'Bring it to TTSave',
      description:
        'Paste the link into the field above. Only public TikTok video links are accepted.',
    },
    {
      title: 'Choose what is available',
      description:
        'When downloads launch, review the source details and choose an available video format.',
    },
  ],
  faqs: [
    {
      question: 'Can I download a video right now?',
      answer:
        'Not yet. This interface is a preview. Video analysis and downloads are still being built, and submitting a link will not start a download.',
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
