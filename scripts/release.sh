#!/bin/sh
# Ship the committed tree to the Linux Docker host and build its release images there.
#
# The Mac cannot build these images: it is arm64, the host is linux/amd64, and the Mac
# has no Docker. APP_BASE_PATH is compiled into the client assets, so it is a build
# argument here and cannot be changed afterwards by the stack.
#
# This never touches the running stack. After it finishes, update the image tags in
# Portainer and redeploy with re-pull disabled; the images are local, not in a registry.
#
# Usage: scripts/release.sh [--prune] [--no-build]
set -eu

host=${RELEASE_HOST:-plex@192.168.1.7}
base_path=${APP_BASE_PATH:-/mynab}
builder=${RELEASE_BUILDER:-mynab-builder}
# The host also runs media and home-automation services, so the builder is capped.
build_cpus=${RELEASE_CPUS:-2}
build_memory=${RELEASE_MEMORY:-2g}

prune=no
build=yes
for arg in "$@"; do
  case "$arg" in
    --prune) prune=yes ;;
    --no-build) build=no ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
test -f package.json || { echo "Run from the repository root" >&2; exit 1; }

# Release only what is committed, so the image always matches a reviewable revision.
if ! git diff --quiet HEAD || test -n "$(git status --porcelain --untracked-files=normal)"; then
  echo "Working tree is dirty. Commit or stash before releasing." >&2
  exit 1
fi

# Release only what is on GitHub (origin), so every image matches a pushed
# revision anyone can check out. Push first: git push.
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || {
  echo "This branch has no upstream on origin. Push it first: git push -u origin HEAD" >&2
  exit 1
}
git fetch --quiet "${upstream%%/*}" || { echo "Could not reach origin to check the push." >&2; exit 1; }
if ! git merge-base --is-ancestor HEAD "$upstream"; then
  echo "HEAD is not pushed to ${upstream}. Run git push, then release." >&2
  exit 1
fi

version=$(node -p 'require("./package.json").version')
commit=$(git rev-parse HEAD)
remote_dir="/home/plex/mynab/releases/${version}"
echo "Releasing ${version} (${commit}) to ${host}:${remote_dir}"

if ssh "$host" "docker image inspect mynab:${version} >/dev/null 2>&1"; then
  echo "mynab:${version} already exists on the host." >&2
  echo "Bump the version in package.json and deploy/portainer/stack.yml first." >&2
  exit 1
fi

archive=$(mktemp -t mynab-release)
trap 'rm -f "$archive"' EXIT HUP INT TERM
git archive --format=tar.gz -o "$archive" HEAD

ssh "$host" "mkdir -p '${remote_dir}'"
scp -q "$archive" "${host}:${remote_dir}/source.tar.gz"
ssh "$host" "cd '${remote_dir}' && tar xzf source.tar.gz && rm source.tar.gz && echo '${commit}' > SOURCE_COMMIT"
echo "Source uploaded."

test "$build" = yes || { echo "Skipping build (--no-build)."; exit 0; }

# Bootstrap the dedicated builder, then apply limits. CPU is set as a quota rather
# than with --cpus: Docker expresses the same cap either way, and it refuses
# --cpus on a container that already carries a quota. Block IO weight matters most
# here, because it is the dimension that was never limited when a build once took
# the host down while its disk was nearly full.
ssh "$host" "
  set -eu
  docker buildx inspect '${builder}' >/dev/null 2>&1 ||
    docker buildx create --name '${builder}' --driver docker-container >/dev/null
  docker buildx inspect '${builder}' --bootstrap >/dev/null
  docker update --cpu-period=100000 --cpu-quota=\$(( ${build_cpus} * 100000 )) \
    --memory='${build_memory}' --memory-swap='${build_memory}' --blkio-weight=100 \
    'buildx_buildkit_${builder}0' >/dev/null
  docker inspect 'buildx_buildkit_${builder}0' --format \
    'builder limits: quota={{.HostConfig.CpuQuota}}/{{.HostConfig.CpuPeriod}} mem={{.HostConfig.Memory}} blkio={{.HostConfig.BlkioWeight}}'
"

for target in runner tools; do
  case "$target" in
    runner) tag="mynab:${version}" ;;
    tools) tag="mynab-tools:${version}" ;;
  esac
  echo "Building ${tag} (${target})..."
  ssh "$host" "cd '${remote_dir}' && docker buildx build --builder '${builder}' \
    --platform linux/amd64 --build-arg APP_BASE_PATH='${base_path}' \
    --target '${target}' -t '${tag}' --load ."
done

# Leaving the builder running would restart it on boot and compete for the disk.
ssh "$host" "
  docker stop 'buildx_buildkit_${builder}0' >/dev/null 2>&1 || true
  docker update --restart=no 'buildx_buildkit_${builder}0' >/dev/null 2>&1 || true
"

if test "$prune" = yes; then
  echo "Pruning build cache..."
  ssh "$host" "docker builder prune -af >/dev/null && df -h / | tail -1"
fi

ssh "$host" "
  docker images --format '{{.Repository}}:{{.Tag}}  {{.ID}}  {{.Size}}' | grep -i mynab
  echo '--- base path ---'
  docker image inspect 'mynab:${version}' --format '{{range .Config.Env}}{{println .}}{{end}}' |
    grep APP_BASE_PATH
  echo '--- runtime user ---'
  docker image inspect 'mynab:${version}' --format 'user={{.Config.User}}'
  echo '--- free space ---'
  df -h / | tail -1
"

cat <<EOF

Built mynab:${version} and mynab-tools:${version} on ${host}.
The running stack was not touched.

Next, in Portainer:
  1. Back up the database and preserve the encryption key separately.
  2. Stacks -> mynab -> Editor: paste the full deploy/portainer/stack.yml for ${version}.
  3. Update the stack with re-pull image DISABLED. These images are local only.
  4. Confirm migrate reaches Exited (0) and ${base_path}/api/health/ready returns 200.
EOF
