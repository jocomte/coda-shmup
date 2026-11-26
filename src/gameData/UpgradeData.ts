export enum UpgradeId {
    MULTI_SHOT = 'multiShot',
    FIRE_RATE = 'fireRate',
    DAMAGE = 'damage',
    PIERCE = 'pierce',
    DASH = 'dash',
    SPEED = 'speed',
    HULL = 'hull',
    MAGNET = 'magnet',
    BULLET_SPEED = 'bulletSpeed',
    REPAIR = 'repair',
}

export type UpgradeDefinition = {
    id: UpgradeId;
    title: string;
    description: string;
    iconFrame: string;
    accentColor: string;
    maxRank: number; // 0 = repeatable indefinitely
};

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
    {
        id: UpgradeId.MULTI_SHOT,
        title: 'CANON MULTIPLE',
        description: '+1 projectile en éventail\nAjoute des canons d\'ailes',
        iconFrame: 'icon_multishot',
        accentColor: '#38bdf8',
        maxRank: 5,
    },
    {
        id: UpgradeId.FIRE_RATE,
        title: 'CADENCE RAPIDE',
        description: '+20% vitesse de tir\nTirs plus fréquents',
        iconFrame: 'icon_firerate',
        accentColor: '#facc15',
        maxRank: 6,
    },
    {
        id: UpgradeId.DAMAGE,
        title: 'TIRS LOURDS',
        description: '+1 dégâts par projectile\nRenforce l\'armement',
        iconFrame: 'icon_damage',
        accentColor: '#f87171',
        maxRank: 6,
    },
    {
        id: UpgradeId.PIERCE,
        title: 'TIRS PERFORANTS',
        description: '+1 cible traversée\nTransperce les vagues',
        iconFrame: 'icon_pierce',
        accentColor: '#e879f9',
        maxRank: 3,
    },
    {
        id: UpgradeId.DASH,
        title: 'PROPULSEUR PHASE',
        description: '-25% recharge du Dash\nOnde de choc au départ',
        iconFrame: 'icon_dash',
        accentColor: '#2dd4bf',
        maxRank: 3,
    },
    {
        id: UpgradeId.SPEED,
        title: 'PROPULSEURS',
        description: '+18% vitesse de déplacement\nActive les réacteurs',
        iconFrame: 'icon_speed',
        accentColor: '#c084fc',
        maxRank: 5,
    },
    {
        id: UpgradeId.HULL,
        title: 'COQUE RENFORCÉE',
        description: '+25 PV max et +25 PV soin\nAjoute du blindage visible',
        iconFrame: 'icon_hull',
        accentColor: '#4ade80',
        maxRank: 6,
    },
    {
        id: UpgradeId.MAGNET,
        title: 'AIMANT SPATIAL',
        description: '+55% portée d\'attraction\nAttire l\'EXP de plus loin',
        iconFrame: 'icon_magnet',
        accentColor: '#60a5fa',
        maxRank: 4,
    },
    {
        id: UpgradeId.BULLET_SPEED,
        title: 'VÉLOCITÉ PLASMA',
        description: '+25% vitesse des balles\nPortée et précision accrues',
        iconFrame: 'icon_bulletspeed',
        accentColor: '#22d3ee',
        maxRank: 4,
    },
    {
        id: UpgradeId.REPAIR,
        title: 'RÉPARATION',
        description: 'Restaure 50% des PV max\nRéparation d\'urgence',
        iconFrame: 'icon_heal',
        accentColor: '#34d399',
        maxRank: 0,
    },
];
