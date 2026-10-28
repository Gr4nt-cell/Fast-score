// Wraps app.json. The Android versionCode (Play's internal build number) is set automatically in
// CI from the number of commits on main, so every build is higher than the last and Play never
// rejects an upload for reusing one. Bump "version" in app.json yourself for user-visible releases.
module.exports = ({ config }) => {
  const fromCi = Number(process.env.VERSION_CODE || 0);
  if (config.android && fromCi > (config.android.versionCode || 0)) {
    config.android.versionCode = fromCi;
  }
  return config;
};
