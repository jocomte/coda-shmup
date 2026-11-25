import { GameObjects, Scenes, Scene } from "phaser";
import Health from "../components/Health.ts";
import Player, { type ActivePowerUpStatus, type ExpStatus } from "../entities/Player.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class MainUIScene extends Scene {
    private static readonly EXP_BAR_WIDTH: number = 984;
    private static readonly EXP_BAR_HEIGHT: number = 36;
    private static readonly HP_BAR_WIDTH: number = 460;
    private static readonly HP_BAR_HEIGHT: number = 40;

    private _expBarFill!: GameObjects.Rectangle;
    private _expBarText!: GameObjects.Text;

    private _hpBarFill!: GameObjects.Rectangle;
    private _hpBarText!: GameObjects.Text;

    private _scoreText!: GameObjects.BitmapText;
    private _powerUpsText!: GameObjects.Text;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.game.events.on(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
        this.game.events.on(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.game.events.off(GameConstants.Events.EXP_CHANGED_EVENT, this.onExpChanged, this);
            this.game.events.off(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const marginX = 48;

        // EXP Bar (full top width)
        const expY = 24;
        this.add.rectangle(marginX, expY, MainUIScene.EXP_BAR_WIDTH, MainUIScene.EXP_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0)
            .setStrokeStyle(3, 0x38bdf8, 0.8);

        this._expBarFill = this.add.rectangle(
            marginX + 3,
            expY + 3,
            0,
            MainUIScene.EXP_BAR_HEIGHT - 6,
            0x0ea5e9,
            1
        ).setOrigin(0, 0);

        this._expBarText = this.add.text(
            marginX + MainUIScene.EXP_BAR_WIDTH / 2,
            expY + MainUIScene.EXP_BAR_HEIGHT / 2,
            "LVL 1  •  0 / 5 XP",
            {
                fontSize: '22px',
                fontFamily: 'future, sans-serif',
                color: '#f8fafc',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // Health Bar (top-left below EXP bar)
        const hpY = 78;
        this.add.rectangle(marginX, hpY, MainUIScene.HP_BAR_WIDTH, MainUIScene.HP_BAR_HEIGHT, 0x0f172a, 0.88)
            .setOrigin(0, 0)
            .setStrokeStyle(3, 0x475569, 0.9);

        this._hpBarFill = this.add.rectangle(
            marginX + 3,
            hpY + 3,
            MainUIScene.HP_BAR_WIDTH - 6,
            MainUIScene.HP_BAR_HEIGHT - 6,
            0x22c55e,
            1
        ).setOrigin(0, 0);

        this._hpBarText = this.add.text(
            marginX + MainUIScene.HP_BAR_WIDTH / 2,
            hpY + MainUIScene.HP_BAR_HEIGHT / 2,
            "HP 100 / 100",
            {
                fontSize: '22px',
                fontFamily: 'future, sans-serif',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5);

        // Score (top-right below EXP bar)
        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(this.scale.width - marginX, 74, "future-bmp", scoreStr, 96)
            .setOrigin(1, 0);

        // Active temporary power-ups
        this._powerUpsText = this.add.text(marginX, 134, "", {
            fontSize: '26px',
            fontFamily: 'future, sans-serif',
            color: '#fde047',
            stroke: '#000000',
            strokeThickness: 4,
            lineSpacing: 6,
        }).setOrigin(0, 0);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        this._powerUpsText?.setText("");

        const health = player.getComponent(Health);
        if (health) {
            this.updateHealthBar(health.current, health.max);
            health.on(Health.CHANGE_EVENT, (current: number) => {
                this.updateHealthBar(current, health.max);
            }, this);
        }

        this.onExpChanged({
            level: player.level,
            exp: player.exp,
            expToNext: player.expToNext,
        });
    }

    private updateHealthBar(current: number, max: number) {
        if (!this._hpBarFill || !this._hpBarText) return;

        const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.HP_BAR_WIDTH - 6;
        this._hpBarFill.width = innerMaxWidth * ratio;

        if (ratio > 0.5) {
            this._hpBarFill.setFillStyle(0x22c55e);
        } else if (ratio > 0.25) {
            this._hpBarFill.setFillStyle(0xf59e0b);
        } else {
            this._hpBarFill.setFillStyle(0xef4444);
        }

        this._hpBarText.setText(`HP ${Math.max(0, current)} / ${max}`);
    }

    private onExpChanged(status: ExpStatus) {
        if (!this._expBarFill || !this._expBarText) return;

        const ratio = status.expToNext > 0 ? Phaser.Math.Clamp(status.exp / status.expToNext, 0, 1) : 0;
        const innerMaxWidth = MainUIScene.EXP_BAR_WIDTH - 6;
        this._expBarFill.width = innerMaxWidth * ratio;

        this._expBarText.setText(`LVL ${status.level}   •   ${status.exp} / ${status.expToNext} XP`);
    }

    private onPowerUpsChanged(activeBuffs: ActivePowerUpStatus[]) {
        if (!this._powerUpsText) return;

        if (activeBuffs.length === 0) {
            this._powerUpsText.setText("");
            return;
        }

        const lines = activeBuffs.map(buff => {
            const seconds = Math.ceil(buff.remainingMs / 1000);
            return `${buff.label} (${seconds}s)`;
        });

        this._powerUpsText.setText(lines.join('\n'));
    }
}
