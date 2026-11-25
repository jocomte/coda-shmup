export type LeaderboardEntry = {
    name: string;
    score: number;
    level: number;
    date: string;
};

export type AudioSettingsData = {
    musicVolume: number;
    sfxVolume: number;
    muted: boolean;
};

export default class SaveConstants {
    public static readonly Keys = Object.freeze({
        PLAYER_BEST_SCORE: 'playerBestScore',
        LEADERBOARD: 'leaderboard',
        LAST_PLAYER_NAME: 'lastPlayerName',
        AUDIO_SETTINGS: 'audioSettings',
    } as const);
}
