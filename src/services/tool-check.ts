import { env, type Environment } from '../config/env.js';
import { runTool, type AnalysisContext } from './tool-process.js';

export async function checkTools(context: AnalysisContext, config: Environment = env) {
  const check = async (executable: string, args: string[], versionPattern: RegExp) => {
    try {
      const result = await runTool(
        executable,
        args,
        { timeoutMs: 5000, maxOutputBytes: 65_536 },
        context,
      );
      return result.code === 0 && versionPattern.test(result.stdout.trim());
    } catch {
      return false;
    }
  };
  const [ytDlp, ffmpeg, ffprobe] = await Promise.all([
    check(
      config.YTDLP_PATH,
      ['--ignore-config', '--no-plugin-dirs', '--version'],
      /^\d{4}\.\d{2}\.\d{2}/,
    ),
    check(config.FFMPEG_PATH, ['-version'], /^ffmpeg version /),
    check(config.FFPROBE_PATH, ['-version'], /^ffprobe version /),
  ]);
  const chrome =
    ytDlp &&
    (await check(
      config.YTDLP_PATH,
      ['--ignore-config', '--no-plugin-dirs', '--list-impersonate-targets'],
      /^Chrome(?:-\d+)?\s+\S+\s+curl_cffi\s*$/im,
    ));
  context.logger.info(
    { requestId: context.requestId, ytDlp, ffmpeg, ffprobe, chrome },
    'Startup tool availability',
  );
  return { ytDlp, ffmpeg, ffprobe, chrome };
}
