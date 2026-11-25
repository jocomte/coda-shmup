export type EnemyBulletConfig = {
    width: number;
    height: number;
    color: number | string;
    speed: number;
    damage: number;
    frame?: string;
};

export type EnemyTypeData = {
    texture: string;
    tint: number | string | null;
    scale: number;
    health: number;
    movementSpeed: number;
    scoreValue: number;
    expValue: number;
    contactDamage: number;
    spawnWeight: number;
    minScoreToSpawn: number;
    minLevelToSpawn: number;
    shootDelayMin: number;
    shootDelayMax: number;
    usesShootAnim: boolean;
    bulletCount: number;
    spreadAngle: number;
    waveAmplitude: number;
    waveFrequency: number;
    dropChance: number;
    bullet: EnemyBulletConfig;
};

export type EnemiesData = {
    [key: string]: EnemyTypeData;
};
