export type EnemyBulletConfig = {
    width: number;
    height: number;
    color: number | string;
    speed: number;
    damage: number;
};

export type EnemyTypeData = {
    texture: string;
    tint: number | string | null;
    scale: number;
    health: number;
    movementSpeed: number;
    scoreValue: number;
    spawnWeight: number;
    minScoreToSpawn: number;
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
