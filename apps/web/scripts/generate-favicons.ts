/**
 * Script to generate favicon files from Logo.png
 * Usage: npx tsx scripts/generate-favicons.ts
 */

import sharp from "sharp"

const sizes = [
  { name: "icon-16", size: 16, output: "public/icon-16x16.png" },
  { name: "icon-32", size: 32, output: "public/icon-32x32.png" },
  { name: "icon-192", size: 192, output: "public/icon-192x192.png" },
  { name: "icon-512", size: 512, output: "public/icon-512x512.png" },
  { name: "apple-icon", size: 180, output: "public/apple-touch-icon.png" },
  { name: "icon", size: 256, output: "app/icon.png" }, // Next.js auto favicon
]

async function generateFavicons() {
  console.log("\n🎨 Generating favicons from Logo.png...\n")

  try {
    for (const { name, size, output } of sizes) {
      await sharp("Logo.png")
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
        })
        .png()
        .toFile(output)

      console.log(`✅ Created ${name} (${size}x${size}) -> ${output}`)
    }

    console.log("\n🎉 All favicons generated successfully!")
    console.log("\nGenerated files:")
    console.log("  - public/icon-16x16.png (16x16)")
    console.log("  - public/icon-32x32.png (32x32)")
    console.log("  - public/icon-192x192.png (192x192)")
    console.log("  - public/icon-512x512.png (512x512)")
    console.log("  - public/apple-touch-icon.png (180x180)")
    console.log("  - app/icon.png (256x256) - Next.js auto-favicon")
    console.log("\nAlso copying full logo to public/logo.png...")

    // Copy full logo to public folder
    await sharp("Logo.png").png().toFile("public/logo.png")

    console.log("✅ Copied Logo.png -> public/logo.png")
  } catch (error) {
    console.error("\n❌ Error generating favicons:", error)
    process.exit(1)
  }
}

generateFavicons()
