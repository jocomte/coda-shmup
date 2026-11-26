export type MapZoneConfig = {
    id: string;
    name: string;
    subtitle: string;
    bgTint: number;
    nebulaColors: number[];
    planetTint: number;
    starColors: number[];
    gridColor: number;
    borderOuterColor: number;
    borderInnerColor: number;
    accentHex: string;
    enemyKeys: string[];
    bossKey: string;
};

export const MAP_ZONES: MapZoneConfig[] = [
    {
        id: 'nebula',
        name: 'NÉBULEUSE POURPRE',
        subtitle: 'Flotte Red-UFO & Chasseurs',
        bgTint: 0xffffff,
        nebulaColors: [0x4c1d95, 0x0e7490, 0x831843, 0x1e3a8a, 0x312e81],
        planetTint: 0xffffff,
        starColors: [0xffffff, 0xbae6fd, 0xfde68a, 0xe9d5ff],
        gridColor: 0x6366f1,
        borderOuterColor: 0xf43f5e,
        borderInnerColor: 0xfb7185,
        accentHex: '#38bdf8',
        enemyKeys: ['ufo', 'interceptor', 'heavy'],
        bossKey: 'boss',
    },
    {
        id: 'cryo',
        name: 'CHAMP CRYO-CRISTAL',
        subtitle: 'Drones Cryo & Gardes Prisme',
        bgTint: 0x38bdf8,
        nebulaColors: [0x0369a1, 0x0e7490, 0x1e40af, 0x0891b2, 0x155e75],
        planetTint: 0x7dd3fc,
        starColors: [0xe0f2fe, 0x7dd3fc, 0x22d3ee, 0xffffff],
        gridColor: 0x0ea5e9,
        borderOuterColor: 0x06b6d4,
        borderInnerColor: 0x67e8f9,
        accentHex: '#22d3ee',
        enemyKeys: ['cryoDrone', 'prismWarden', 'ufo'],
        bossKey: 'bossCryo',
    },
    {
        id: 'solar',
        name: 'CEINTURE SOLARIENNE',
        subtitle: 'Faucons Solaires & Noyaux Magma',
        bgTint: 0xf97316,
        nebulaColors: [0x9a3412, 0xb45309, 0x7c2d12, 0xd97706, 0x991b1b],
        planetTint: 0xfdba74,
        starColors: [0xfef08a, 0xfdba74, 0xfacc15, 0xfef2f2],
        gridColor: 0xf59e0b,
        borderOuterColor: 0xea580c,
        borderInnerColor: 0xfacc15,
        accentHex: '#fb923c',
        enemyKeys: ['solarStriker', 'magmaCore', 'interceptor'],
        bossKey: 'bossSolar',
    },
    {
        id: 'void',
        name: 'ABYSSE DU NÉANT',
        subtitle: 'Spectres du Néant & Léviathans',
        bgTint: 0x10b981,
        nebulaColors: [0x064e3b, 0x115e59, 0x3b0764, 0x047857, 0x1e1b4b],
        planetTint: 0x6ee7b7,
        starColors: [0xa7f3d0, 0x34d399, 0xd8b4fe, 0xffffff],
        gridColor: 0x10b981,
        borderOuterColor: 0x059669,
        borderInnerColor: 0x34d399,
        accentHex: '#34d399',
        enemyKeys: ['voidPhantom', 'voidHeavy', 'prismWarden'],
        bossKey: 'bossVoid',
    },
];

export function getMapZoneForSector(sectorNumber: number): MapZoneConfig {
    const idx = Math.max(0, sectorNumber - 1) % MAP_ZONES.length;
    return MAP_ZONES[idx];
}
