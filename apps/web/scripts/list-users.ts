/**
 * Script to list all users in the database
 * Usage: npx tsx scripts/list-users.ts
 */

import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function listUsers() {
  try {
    console.log("\n📋 Listing all users:\n")

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        displayName: true,
        discordId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (users.length === 0) {
      console.log("No users found. Make sure someone has logged in at least once.")
      process.exit(0)
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. 👤 ${user.displayName || user.name || "Unknown"}`)
      console.log(`   Email: ${user.email || "N/A"}`)
      console.log(`   Discord ID: ${user.discordId || "N/A"}`)
      console.log(`   Joined: ${user.createdAt.toLocaleDateString()}`)
      console.log()
    })

    console.log(`Total users: ${users.length}`)
  } catch (error) {
    console.error("\n❌ Error listing users:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

listUsers()
