export const legalPages = [
  {
    path: '/privacy',
    title: 'Privacy Policy',
    description:
      'How TikSaveMp4 processes public TikTok links, temporary downloads, request logs and browser preferences.',
    introduction:
      'TikSaveMp4 at tiksavemp4.online processes a public video link to prepare a download you request. This policy describes the current application; it does not promise anonymous or completely private use.',
    sections: [
      {
        heading: 'Information used to provide a download',
        paragraphs: [
          'The server receives the TikTok URL you submit and retrieves the public title, creator, thumbnail, duration and available formats. It keeps analysis records and job status in server memory and writes temporary previews and video files to server-controlled storage. Access tokens authorize job status, preview and file requests; keep these tokens and file links confidential.',
          'Network connections expose technical information such as your IP address to the hosting provider. The application uses IP-based rate limiting. Request logs include a request ID, method, path, response status and timing; the configured request serializer omits query strings. Error diagnostics may contain additional technical context. Do not include passwords or sensitive information in links you submit.',
          'Full submitted TikTok URLs are held temporarily to perform analysis and downloads; ordinary application request logging does not record request bodies or query strings. There is no promise that a full URL can never appear in a diagnostic error or provider log. Browsers send technical headers, including a user agent that may describe browser and device software. The current application request serializer does not record those headers, but hosting and security providers may log them.',
        ],
      },
      {
        heading: 'Browser storage and cookies',
        paragraphs: [
          'The application stores your light or dark theme preference in local storage on your device. You can remove it using your browser’s site-data settings. The application currently adds no account, advertising or analytics cookies and contains no third-party analytics integration. Hosting or security services may operate separately; the owner must disclose any such additions before launch.',
        ],
      },
      {
        heading: 'Third parties and purpose',
        paragraphs: [
          'The server contacts TikTok and its media providers to obtain the public information and media needed for your request. Those providers receive the server’s network requests and operate under their own policies. Local artwork and server-proxied previews avoid loading remote thumbnail images directly in your browser.',
          'Information is used to fulfill downloads, limit abuse, diagnose failures and operate the service. The current application includes no mechanism to sell user data or use submitted links for advertising. Hosting operators may have access to operational data; their identity and data-processing arrangements must be confirmed by the owner.',
        ],
      },
      {
        heading: 'Retention and deletion',
        paragraphs: [
          'Successful file delivery, cancellation and failure trigger temporary video cleanup. Analysis records, job records and previews expire and are swept periodically. A failed cleanup may be retried, and an interrupted server may leave temporary files for a later sweep. These are operational cleanup mechanisms, not a guarantee of instantaneous deletion from all storage or backups.',
          'The application does not establish a retention period for hosting logs, application-log exports or provider backups. The owner must set and publish those periods before launch. Files saved to your own device remain under your control.',
        ],
      },
      {
        heading: 'Your choices and requests',
        paragraphs: [
          'Submit only public links you are authorized to use. Cancel a job using the downloader’s Cancel action while it is available, clear the input when finished and remove local browser data if desired. For access, correction, deletion or other privacy requests, use the Contact page. The owner must assess rights and verification requirements under the applicable law; this draft does not select a jurisdiction or promise an unimplemented request process.',
          'This service is not designed to collect children’s personal information. Do not submit such information or use the service in violation of applicable age requirements. An owner receiving a concern about a child’s information should investigate and remove retained data where appropriate.',
        ],
      },
      {
        heading: 'Security and monitoring',
        paragraphs: [
          'The application uses security headers, input validation, rate limiting and token-protected temporary file routes. These measures reduce risk but cannot guarantee complete security or anonymity. Keep job and download tokens confidential. The application uses local server error logging and does not currently integrate an external error-monitoring service. The policy must be updated before adding analytics, advertising or external monitoring, with the actual providers and their retention disclosed.',
        ],
      },
      {
        heading: 'Updates',
        paragraphs: [
          'Material changes to collection, providers, retention or browser storage require an updated policy before the changed practice begins. The review date on this page identifies the current operational draft.',
        ],
      },
    ],
  },
  {
    path: '/terms',
    title: 'Terms of Use',
    description:
      'Conditions for using TikSaveMp4 to download authorized public TikTok videos in available MP4 formats.',
    introduction:
      'These terms describe permitted use of the TikSaveMp4 service at tiksavemp4.online. Read them together with the Privacy Policy and Responsible Use page before submitting a link.',
    sections: [
      {
        heading: 'Acceptance and eligibility',
        paragraphs: [
          'By using TikSaveMp4, you agree to these terms. If you do not agree, do not submit links or use the downloader. Use the service only if you have the legal capacity to accept these terms and meet the age and permission requirements applicable to you. A parent or guardian must authorize use where the applicable law requires it. The service offers no account or age-verification mechanism; this does not waive those requirements.',
          'You may use TikSaveMp4 only for content you own, content you have permission to save, or content you are otherwise legally permitted to use.',
        ],
      },
      {
        heading: 'Scope of the service',
        paragraphs: [
          'TikSaveMp4 analyzes supported public TikTok video links and prepares available MP4 video formats with audio. When source audio and server processing tools are available, you can also request an MP3 audio conversion. Audio quality depends on the source. Availability depends on extractor compatibility, service capacity and configured limits. A publicly accessible URL is not a grant of permission to copy or reuse its content.',
          'The service does not provide account login, private-video access, cookie-based access or regional-restriction bypasses. It does not improve, upscale or restore quality. Photo and slideshow downloads are not offered. MP3 conversion is lossy and is not a promise of studio or lossless quality. Watermark removal, a particular resolution or a completion speed is not guaranteed.',
        ],
      },
      {
        heading: 'Your responsibilities',
        paragraphs: [
          'Use the service only for content you own, have permission to download, or may lawfully download under the rules applicable to your intended use. You are responsible for permissions relating to the video, soundtrack, depicted people and any later publication. Respect TikTok’s applicable terms and creators’ restrictions. Do not remove attribution or imply endorsement.',
          'Do not submit unlawful content, seek restricted material, attempt to evade rate limits, probe server storage, misuse access tokens or overload the service with automated requests. The service may reject requests or restrict access to protect users, creators and infrastructure.',
        ],
      },
      {
        heading: 'Availability and downloads',
        paragraphs: [
          'Requests can fail or expire. Keep the page open while preparing a download; file links are authorized, short-lived and intended for one delivery. Save the file promptly. TikSaveMp4 is not a permanent media archive and cannot recover a file deleted after delivery or expiry.',
          'Source formats and metadata are displayed as returned by the backend. Missing information is not a guarantee about the source. Review the resulting file before relying on it.',
        ],
      },
      {
        heading: 'Ownership and independence',
        paragraphs: [
          'Creators and other rights holders retain rights in their content. TikSaveMp4 grants no license to downloaded media. TikSaveMp4 is an independent service and is not affiliated with, endorsed by or sponsored by TikTok or ByteDance.',
        ],
      },
      {
        heading: 'Service limitations and legal rights',
        paragraphs: [
          'The service is provided on an available basis without a promise of uninterrupted access, compatibility or fitness for a particular purpose. You remain responsible for your use of downloaded files. Nothing in this draft excludes rights or remedies that cannot lawfully be excluded. The owner should obtain jurisdiction-specific advice before adopting liability, consumer, age or dispute provisions.',
          'To the extent permitted by applicable law, the operator disclaims implied warranties and is not responsible for indirect or consequential losses arising from source unavailability, service interruption or your unauthorized reuse of media. This does not limit liability for fraud, deliberate misconduct or any liability that cannot legally be limited, and it does not remove mandatory consumer rights. No monetary cap or governing forum is stated without jurisdiction-specific review.',
        ],
      },
      {
        heading: 'Changes and concerns',
        paragraphs: [
          'Service features and limits may change. Material changes to these terms should be published before they take effect. Privacy, support and copyright concerns should be directed through the Contact page. No governing law, company identity or dispute forum has been invented in this draft.',
        ],
      },
    ],
  },
  {
    path: '/responsible-use',
    title: 'Responsible Use',
    description:
      'Respect creators, permissions and public-access limits when saving TikTok videos with TikSaveMp4.',
    introduction:
      'A video being public does not mean every use of it is permitted. Use TikSaveMp4 to save content responsibly and respect the people who made or appear in it.',
    sections: [
      {
        heading: 'Before downloading',
        paragraphs: [
          'Confirm you own the video or have permission for your intended use. Permission to watch or save a personal copy does not necessarily permit reposting, advertising, resale or other distribution. Music and other material within a video can have separate rights.',
          'Only supported, publicly accessible TikTok links can be processed. Private, restricted, login-only and permission-controlled content is not supported. Use only an HTTPS public TikTok link from the approved TikTok hosts. Do not send credentials, account details or private or sensitive material. Do not attempt to bypass technical access restrictions.',
        ],
      },
      {
        heading: 'After downloading',
        paragraphs: [
          'Keep creator attribution and any license information. Do not misrepresent authorship, impersonate a creator, harass people shown in a video or use content to violate privacy. Seek separate permission before reuse where required. Delete copies if you discover you lack the necessary permission.',
          'Downloading does not transfer copyright, privacy rights or any other rights to you. Respect creators, applicable law and platform rules; do not use downloaded content to exploit others or deceive viewers.',
          'Extracting or downloading audio does not grant ownership, redistribution rights or commercial-use permission. Music, recordings and performances may have separate rights holders. Obtain the permissions required for your intended use; MP3 conversion does not make music copyright-free or royalty-free.',
        ],
      },
      {
        heading: 'Respect service limits',
        paragraphs: [
          'Choose only a format offered for your analyzed video. Do not automate bulk scraping or work around rate, concurrency, duration or size limits. Unknown sizes and progress are shown as unknown; available source quality is never enhanced by this service.',
          'Available formats and quality depend on the source. TikSaveMp4 does not improve, upscale or restore source quality. Watermark behavior depends on the media source supplied by TikTok. The service does not crop, blur, paint over or artificially remove ownership marks; do not remove ownership information to misrepresent authorship.',
        ],
      },
      {
        heading: 'Responsible and inappropriate examples',
        paragraphs: [
          'Responsible uses include saving your own published video, saving a video with the creator’s permission, or keeping a copy where applicable law permits that use. Check that any permission also covers the soundtrack and your intended later use.',
          'Inappropriate or prohibited uses include republishing another creator’s work without permission, selling content without rights, attempting to access private videos, removing attribution to pretend you created a video, or using content for harassment, exploitation or deception. This guidance is general information, not personalized legal advice.',
        ],
      },
      {
        heading: 'Report a concern',
        paragraphs: [
          'See the Copyright page for what to include in a rights complaint and the Contact page for the current reporting channel. TikSaveMp4 does not host a public library of submitted videos and cannot remove the original video from TikTok or recall copies already saved to another person’s device.',
        ],
      },
    ],
  },
  {
    path: '/copyright',
    title: 'Copyright and DMCA',
    description:
      'How to document a copyright concern involving TikSaveMp4’s temporary download service or website content.',
    introduction:
      'TikSaveMp4 respects creators’ rights. This is an operational reporting procedure, not a claim that a statutory agent has been registered or that a particular safe-harbor regime applies.',
    sections: [
      {
        heading: 'What the service can address',
        paragraphs: [
          'TikSaveMp4 processes public links on request, temporarily prepares files and removes temporary data through delivery and expiry cleanup. It does not publish a searchable video library. The owner can investigate service misuse and website content, but cannot delete the original TikTok post or recall a downloaded copy. Report the original post to TikTok as well when appropriate.',
          'TikSaveMp4 does not own third-party videos or grant a license to them. Rights remain with the creator and other rights holders.',
        ],
      },
      {
        heading: 'Information to include',
        paragraphs: [
          'Provide your name and a reply address, identify the work and your relationship to the rights holder, include the exact TikTok URL or TikSaveMp4 page involved, and explain the concern and requested action. If available, include the request ID and approximate time. Do not send private access tokens, passwords or unnecessary identity documents.',
          'For a notice intended to meet US DMCA requirements, identify the protected work and the allegedly infringing material or activity with enough information to locate it. Provide a mailing address, telephone number and email for contact. Include a good-faith belief that the disputed use is not authorized by the rights holder, their agent or the law. State that the notice is accurate and, under penalty of perjury, that you are authorized to act for the owner of the exclusive right concerned. Sign physically or electronically; an electronic signature should identify the authorized sender. The owner must obtain legal advice about applicable notice requirements and designated-agent obligations.',
        ],
      },
      {
        heading: 'Review and response',
        paragraphs: [
          'Use the Contact page’s reporting channel. The owner should verify the complaint, request clarification when needed and consider proportionate action, including removal of website material, cleanup of retained temporary data or restrictions on abusive use. No response deadline or automatic outcome is promised by the application.',
          'Do not send knowingly false or misleading complaints. False notices can have legal consequences. No formal DMCA safe-harbor status, registered agent or automatic reinstatement procedure is claimed here.',
        ],
      },
      {
        heading: 'Counter-notices where applicable',
        paragraphs: [
          'If you believe content was restricted by mistake, contact the operator with evidence. Where a US DMCA counter-notice procedure applies, it ordinarily requires a physical or electronic signature, identification and former location of the removed material, a statement under penalty of perjury that removal resulted from mistake or misidentification, and your name, address and telephone number. It also requires consent to the relevant federal court’s jurisdiction and acceptance of service from the complainant or their agent. Obtain legal advice before submitting these statements. The operator must confirm the applicable process; this temporary downloader does not promise public reposting or automatic restoration.',
        ],
      },
    ],
  },
  {
    path: '/contact',
    title: 'Contact and Support',
    description:
      'Support, privacy and copyright reporting for TikSaveMp4 at tiksavemp4.online.',
    introduction:
      'Use the published contact channel for a download problem, privacy question, security concern or copyright report. The website currently has no contact form, account dashboard or ticket-tracking system.',
    sections: [
      {
        heading: 'Download support',
        paragraphs: [
          'Include the request ID shown with an error, the approximate time, your browser and a description of what happened. Share a public TikTok link only if needed to reproduce the issue. Do not send authorization tokens or private download links. For expired files, analyze the public link again and start a new download if it remains available.',
        ],
      },
      {
        heading: 'Privacy and copyright',
        paragraphs: [
          'Explain the relevant data or content and the action you are requesting. See the Privacy Policy and Copyright page for more detail. The owner should request only information needed to verify and resolve the concern.',
        ],
      },
      {
        heading: 'Security reports',
        paragraphs: [
          'Describe the affected page, impact and safe steps to reproduce. Do not access other users’ jobs, retain their data or publish access tokens. No bounty program or compensation promise is currently offered.',
        ],
      },
    ],
  },
] as const;
