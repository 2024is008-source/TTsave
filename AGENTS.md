# TTSave project rules

These rules apply throughout this repository. Read `reference/code.html` and `reference/DESIGN.md` completely before implementation. Do not modify files inside `reference`.

1. Use Node.js 24 LTS, TypeScript strict mode, Express and EJS.
2. Use locally compiled CSS. Never use Tailwind CDN in production.
3. Keep the premium Apple-inspired TTSave design direction.
4. Support only publicly accessible TikTok URLs.
5. Do not implement private-video, login, cookie or regional-restriction bypasses.
6. Do not use inline `onclick` handlers or inline application scripts.
7. Do not fabricate resolutions, sizes, speeds, progress or download statistics.
8. Only display information returned by the backend.
9. Do not claim that TTSave improves, upscales or restores video quality.
10. Do not advertise photo, slideshow, audio or 4K support unless it is implemented and tested.
11. Validate all input using Zod.
12. Run external programs with `child_process.spawn` and `shell:false`.
13. Never place user input inside shell commands.
14. Never allow users to select server paths or filenames.
15. Do not hotlink production images.
16. Add accessibility, mobile responsiveness and reduced-motion support.
17. Add tests for important services and routes.
18. Run lint, typecheck, tests and build after every major step.
19. Do not create Docker files.
20. Do not commit automatically.
