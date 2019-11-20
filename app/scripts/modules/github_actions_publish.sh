#!/bin/bash
MODULE=$1

# Run this script from the 'deck/app/scripts/modules' directory
cd `dirname $0`

# Show help text if no modules were specified
if [ "$1" == "" ] ; then
  echo "Publish a single module to npm. Version is expected to already be bumped."
  echo "$0 <module>"
  exit 1
fi

if [ $# -ne 1 ] ; then
  echo "This script is only meant to be run with a single module, but more than 1 was provided: $*"
  echo "$0 <module>"
fi

# Check that this is only run by GitHub Actions
echo "Deck package publisher ---> Checking that this script is run by GitHub Actions."
if [ "x${GITHUB_ACTIONS}" != "xtrue" ] ; then
  echo "This publish script should only be run by GitHub Actions and is not meant to be run locally."
  exit 2
fi

# Check that the module exist
echo "Deck package publisher ---> Checking that (${MODULE}) exist..."
CWD=`pwd`
for DIR in ${MODULE} ; do
  if [ ! -e ${DIR}/package.json ] ; then
    echo "$CWD/${DIR}/package.json does not exist"
    exit 3
  fi
done

# Run yarn
echo "Deck package publisher ---> Updating to latest dependencies..."
pushd ../../../
yarn
popd

# Determine upstream dependencies and proper build order
echo "Deck package publisher ---> Preparing to publish ${MODULE}..."
BUILDORDER=`./build_order.sh ${MODULE}`
echo "Deck package publisher ---> Package build order:"
echo "${BUILDORDER}"
echo

# Loop over packages to build and either a) only build (if package is just a dependency) or b) build and publish

for DIR in ${BUILDORDER} ; do
  # Check if the current package to build is in PACKAGEDIRS (if so, publish it)
  pushd ${DIR} > /dev/null
  if [ "${DIR}" == "${MODULE}" ] ; then
    echo "Deck package publisher ---> Publishing ${MODULE}..."
    # npm config set //registry.npmjs.org/:_authToken=$NODE_AUTH_TOKEN
    echo "npm publish"
  else
    echo "Deck package publisher ---> Building (but not publishing) upstream dependency '${DIR}'..."
    yarn prepublishOnly
  fi

  popd > /dev/null

done
