/**
 * Ad-hoc code signing for unsigned macOS builds.
 *
 * ImageStudio ships without a Developer ID. electron-builder's `identity: null`
 * skips signing altogether, which leaves the bundle with Electron's own
 * linker-signed stub and no sealed resources — Squirrel.Mac then rejects the
 * downloaded update with "Code has no resources but signature indicates they
 * must be present", and in-app updates can never install.
 *
 * An ad-hoc signature (`codesign --sign -`) needs no certificate, seals the
 * resources, and is enough for Squirrel to validate the update. It does not
 * make the app notarized — users still clear the quarantine flag on first run.
 */
const { execFileSync } = require('child_process')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  console.log(`  • ad-hoc signing   file=${appPath}`)

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
}
