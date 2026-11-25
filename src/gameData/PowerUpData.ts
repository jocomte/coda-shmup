export enum PowerUpType {
    HEAL = 'heal',
    MULTI_SHOT = 'multiShot',
    RAPID_FIRE = 'rapidFire',
    SPEED_BOOST = 'speedBoost',
}

export type PowerUpVisualConfig = {
    frame: string;
    tint: number;
    label: string;
    durationMs: number;
};

export const POWERUP_CONFIGS: Record<PowerUpType, PowerUpVisualConfig> = {
    [PowerUpType.HEAL]: {
        frame: 'playerLife1_blue',
        tint: 0x4ade80,
        label: '+25 HP',
        durationMs: 0,
    },
    [PowerUpType.MULTI_SHOT]: {
        frame: 'star1',
        tint: 0x38bdf8,
        label: 'TRIPLE SHOT',
        durationMs: 10000,
    },
    [PowerUpType.RAPID_FIRE]: {
        frame: 'star2',
        tint: 0xfacc15,
        label: 'RAPID FIRE',
        durationMs: 8000,
    },
    [PowerUpType.SPEED_BOOST]: {
        frame: 'star3',
        tint: 0xc084fc,
        label: 'SPEED BOOST',
        durationMs: 8000,
    },
};
