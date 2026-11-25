export default class GameConstants {
    public static readonly Events = Object.freeze({
        PLAYER_SPAWNED_EVENT: "playerSpawned",
        ENEMY_SPAWNED_EVENT: "enemySpawned",
        POWERUP_CHANGED_EVENT: "powerupChanged",
        EXP_CHANGED_EVENT: "expChanged",
        LEVEL_UP_EVENT: "levelUp",
        UPGRADE_APPLIED_EVENT: "upgradeApplied",
    } as const);

    public static readonly SceneKeys = Object.freeze({
        HOME: "HomeScene",
        MAIN_GAME: "MainGameScene",
        MAIN_UI: "MainUIScene",
        LEVEL_UP: "LevelUpScene",
        GAME_OVER: "GameOverScene",
    } as const);

    public static readonly MAP_WIDTH: number = 2160;
    public static readonly MAP_HEIGHT: number = 2160;
    public static readonly MAX_SCORE_DIGITS: number = 6;

    public static readonly ARENA_WIDTH: number = 3400;
    public static readonly ARENA_HEIGHT: number = 4700;


}