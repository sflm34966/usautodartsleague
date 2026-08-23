import os
from pathlib import Path

required = ["CM_KEYSTORE_PATH", "CM_KEYSTORE_PASSWORD", "CM_KEY_ALIAS", "CM_KEY_PASSWORD"]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("Missing Codemagic Android signing variables: " + ", ".join(missing))

path = Path("android/app/build.gradle")
text = path.read_text(encoding="utf-8")

build_types = text.find("    buildTypes {")
if build_types < 0:
    raise SystemExit("Could not find buildTypes in android/app/build.gradle")

release_signing = '''    signingConfigs {
        release {
            storeFile file(System.getenv("CM_KEYSTORE_PATH"))
            storePassword System.getenv("CM_KEYSTORE_PASSWORD")
            keyAlias System.getenv("CM_KEY_ALIAS")
            keyPassword System.getenv("CM_KEY_PASSWORD")
        }
    }

'''
text = text[:build_types] + release_signing + text[build_types:]

build_types = text.find("    buildTypes {")
release_block = text.find("        release {", build_types)
if release_block < 0:
    raise SystemExit("Could not find release buildType in android/app/build.gradle")

debug_signing = text.find("signingConfig signingConfigs.debug", release_block)
if debug_signing < 0:
    raise SystemExit("Could not find Expo release debug-signing line")

text = (
    text[:debug_signing]
    + "signingConfig signingConfigs.release"
    + text[debug_signing + len("signingConfig signingConfigs.debug"):]
)
path.write_text(text, encoding="utf-8")
print("Release signing configured with Codemagic keystore.")
