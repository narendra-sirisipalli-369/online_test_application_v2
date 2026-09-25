import bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const avatars = [
        { legacyName: 'Falcon', name: 'Aran Jamison', imageUrl: '/avatars/aran-jamison.png', accentColor: '#ef8f79' },
        { legacyName: 'Tiger', name: 'Vera Scale', imageUrl: '/avatars/profile-2b.png', accentColor: '#6a8b64' },
        { legacyName: 'Dolphin', name: 'Marina Byte', imageUrl: '/avatars/profile-1a.png', accentColor: '#f35ea4' },
        { legacyName: 'Owl', name: 'Rowan Hart', imageUrl: '/avatars/profile-2c.png', accentColor: '#d7aa7d' },
        { legacyName: 'Fox', name: 'Suri Ember', imageUrl: '/avatars/profile-3b.png', accentColor: '#f08f89' },
        { legacyName: 'Panda', name: 'Bruno Slate', imageUrl: '/avatars/profile-3c.png', accentColor: '#5c6ea9' },
        { legacyName: 'Koala', name: 'Rosie North', imageUrl: '/avatars/profile-1b.png', accentColor: '#d86db2' },
        { legacyName: 'Penguin', name: 'Milo Crest', imageUrl: '/avatars/profile-3a.png', accentColor: '#314d82' },
        { legacyName: 'Wolf', name: 'Iris Vale', imageUrl: '/avatars/profile-2a.png', accentColor: '#f6a2b8' },
    ];
    for (const avatar of avatars) {
        const existing = await prisma.avatar.findFirst({
            where: {
                OR: [
                    { name: avatar.legacyName },
                    { name: avatar.name },
                ],
            },
        });
        if (existing) {
            await prisma.avatar.update({
                where: { id: existing.id },
                data: {
                    name: avatar.name,
                    imageUrl: avatar.imageUrl,
                    accentColor: avatar.accentColor,
                },
            });
            continue;
        }
        await prisma.avatar.create({
            data: {
                name: avatar.name,
                imageUrl: avatar.imageUrl,
                accentColor: avatar.accentColor,
            },
        });
    }
    const adminName = process.env.ADMIN_NAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.upsert({
        where: { name: adminName },
        update: {
            passwordHash,
            role: UserRole.ADMIN,
        },
        create: {
            name: adminName,
            passwordHash,
            role: UserRole.ADMIN,
        },
    });
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
