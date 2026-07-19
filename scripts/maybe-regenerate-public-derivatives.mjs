if (process.env.REBUILD_PUBLIC_MEDIA === "1") {
  await import("./regenerate-public-derivatives.mjs");
} else {
  console.log("Public image derivative rebuild not requested.");
}
