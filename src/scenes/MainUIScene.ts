import { GameObjects, Scenes, Scene } from "phaser";
import Health from "../components/Health.ts";
import Player, { type ActivePowerUpStatus } from "../entities/Player.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class MainUIScene extends Scene {
    private _playerHealthText: GameObjects.BitmapText;
    private _scoreText: GameObjects.BitmapText;
    private _powerUpsText: GameObjects.Text;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_UI);
    }

    // noinspection JSUnusedGlobalSymbols
    init() {
        this.game.events.on(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
        this.game.events.on(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
        this.registry.events.on(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);

        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.PLAYER_SPAWNED_EVENT, this.onPlayerSpawned, this);
            this.game.events.off(GameConstants.Events.POWERUP_CHANGED_EVENT, this.onPowerUpsChanged, this);
            this.registry.events.off(RegistryConstants.Events.PLAYER_SCORE_CHANGE, this.onPlayerScoreChanged, this);
        }, this);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        const playerHealthIcon = this.add.image(64, 64, "sprites", "playerLife1_blue")
            .setOrigin(0, 0).setScale(1.5);
        const playerHealthTextX = playerHealthIcon.x + playerHealthIcon.displayWidth + 16;
        this._playerHealthText = this.add.bitmapText(playerHealthTextX, 64, "future-bmp", "x0", 128);

        let scoreStr: string = "".padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        if (this.registry.has(RegistryConstants.Keys.PLAYER_SCORE))
            scoreStr = this.registry.get(RegistryConstants.Keys.PLAYER_SCORE).toString()
                .padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText = this.add.bitmapText(this.scale.width - 64, 64, "future-bmp", scoreStr, 128)
            .setOrigin(1, 0);

        this._powerUpsText = this.add.text(64, 196, "", {
            fontSize: '30px',
            fontFamily: 'future, sans-serif',
            color: '#e2e8f0',
            stroke: '#000000',
            strokeThickness: 4,
            lineSpacing: 8,
        }).setOrigin(0, 0);

        this.scene.bringToTop();

        console.log("MainUIScene created");
    }

    private onPlayerScoreChanged(_: any, value: number) {
        const scoreStr: string = value.toString().padStart(GameConstants.MAX_SCORE_DIGITS, "0");
        this._scoreText.setText(scoreStr);
    }

    private onPlayerSpawned(player: Player) {
        this._playerHealthText.setText("x" + player.getComponent(Health)?.current);
        this._powerUpsText?.setText("");

        player.getComponent(Health)?.on(Health.CHANGE_EVENT, (current: number) => {
            this._playerHealthText.setText("x" + current);
        }, this);
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
