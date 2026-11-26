import { Scene, Scenes } from 'phaser';
import Health from "../components/Health.ts";
import Player from "../entities/Player.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import AudioManager from "../managers/AudioManager.ts";
import SaveConstants from "../SaveConstants.ts";
import EntityManager from "../managers/EntityManager.ts";
import GameConstants from "../GameConstants.ts";
import { GamepadEdgeTracker } from "../utils/GamepadUtils.ts";

export default class MainGameScene extends Scene {
    private saveManager: SaveManager;
    private audioManager: AudioManager;
    private entityManager: EntityManager;
    private readonly _gamepadTracker = new GamepadEdgeTracker();
    private _player?: Player;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_GAME);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        if (!this.saveManager) {
            console.error('SaveManager plugin not found');
        }
        this.saveManager?.load();

        this.audioManager = this.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager;
        this.audioManager?.initSettingsFromSave();
        this.audioManager?.ensureMusicStarted();

        this._gamepadTracker.reset(this);

        const mapWidth = GameConstants.MAP_WIDTH;
        const mapHeight = GameConstants.MAP_HEIGHT;

        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

        this.createSpaceEnvironment(mapWidth, mapHeight);

        if (!this.entityManager) {
            console.error('EntityManager plugin not found');
        }

        const player = this.entityManager.initAndSpawnPlayer();
        this._player = player;
        this.registry.set(RegistryConstants.Keys.PLAYER_SCORE, 0);
        this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, player.level);

        player.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            // Hide the player and let its explosion play before showing the game over screen
            player.disableBody(true, true);
            this.time.delayedCall(1000, this.endGame, [], this);
        }, this);

        const onLevelUp = (level: number) => {
            this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, level);
            this.openLevelUpModal(player);
        };
        const onResume = () => {
            this._gamepadTracker.reset(this);
        };
        this.game.events.on(GameConstants.Events.LEVEL_UP_EVENT, onLevelUp, this);
        this.events.on(Scenes.Events.RESUME, onResume, this);
        this.events.once(Scenes.Events.SHUTDOWN, () => {
            this.game.events.off(GameConstants.Events.LEVEL_UP_EVENT, onLevelUp, this);
            this.events.off(Scenes.Events.RESUME, onResume, this);
        }, this);

        this.cameras.main.startFollow(player, true, 0.12, 0.12);

        this.entityManager.initEnemies();
        this.entityManager.initGroupCollisions();

        if (this.input.keyboard) {
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => this.scene.restart());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => this.openPauseModal());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => this.openPauseModal());
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => this.audioManager?.toggleMute());
        } else {
            console.error('No keyboard input');
        }

        console.log("MainGameScene created");
    }

    public openPauseModal() {
        if (!this._player?.active) return;
        if (this.scene.isPaused(GameConstants.SceneKeys.MAIN_GAME)) return;
        if (this.scene.isActive(GameConstants.SceneKeys.LEVEL_UP) || this.scene.isActive(GameConstants.SceneKeys.PAUSE)) return;

        this.scene.pause(GameConstants.SceneKeys.MAIN_GAME);
        this.scene.launch(GameConstants.SceneKeys.PAUSE);
    }

    private createSpaceEnvironment(mapWidth: number, mapHeight: number) {
        // Base tiled space backdrop
        this.add.tileSprite(0, 0, mapWidth, mapHeight, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2)
            .setAlpha(0.75)
            .setDepth(0);

        // Soft glowing space nebulae clouds across the arena
        const nebulaColors = [0x4c1d95, 0x0e7490, 0x831843, 0x1e3a8a, 0x312e81];
        for (let i = 0; i < 12; i++) {
            const nx = Phaser.Math.Between(250, mapWidth - 250);
            const ny = Phaser.Math.Between(250, mapHeight - 250);
            const radius = Phaser.Math.Between(260, 520);
            const color = nebulaColors[i % nebulaColors.length];
            this.add.circle(nx, ny, radius, color, 0.08).setDepth(0);
            this.add.circle(nx + 40, ny - 30, radius * 0.6, color, 0.06).setDepth(0);
        }

        // Distant planets/moons as visual landmarks in the arena
        this.add.image(mapWidth * 0.28, mapHeight * 0.25, 'planet')
            .setScale(0.9)
            .setAlpha(0.45)
            .setDepth(1);
        this.add.image(mapWidth * 0.74, mapHeight * 0.72, 'planet')
            .setScale(0.55)
            .setTint(0x38bdf8)
            .setAlpha(0.32)
            .setDepth(1);

        // Twinkling starfield scattered across the arena
        const starColors = [0xffffff, 0xbae6fd, 0xfde68a, 0xe9d5ff];
        for (let i = 0; i < 180; i++) {
            const sx = Phaser.Math.Between(30, mapWidth - 30);
            const sy = Phaser.Math.Between(30, mapHeight - 30);
            const radius = Phaser.Math.FloatBetween(1.2, 3.2);
            const alpha = Phaser.Math.FloatBetween(0.25, 0.85);
            const star = this.add.circle(sx, sy, radius, starColors[i % starColors.length], alpha).setDepth(1);

            if (i % 5 === 0) {
                this.tweens.add({
                    targets: star,
                    alpha: 0.12,
                    duration: Phaser.Math.Between(1200, 2600),
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
        }

        this.drawArenaBounds(mapWidth, mapHeight);
    }

    private drawArenaBounds(mapWidth: number, mapHeight: number) {
        const graphics = this.add.graphics().setDepth(2);

        // Subtle tactical sector grid for clear spatial movement feedback
        graphics.lineStyle(2, 0x6366f1, 0.14);
        const gridSize = 240;
        for (let x = gridSize; x < mapWidth; x += gridSize) {
            graphics.lineBetween(x, 0, x, mapHeight);
        }
        for (let y = gridSize; y < mapHeight; y += gridSize) {
            graphics.lineBetween(0, y, mapWidth, y);
        }

        // Glowing intersection markers
        graphics.fillStyle(0x818cf8, 0.28);
        for (let x = gridSize; x < mapWidth; x += gridSize) {
            for (let y = gridSize; y < mapHeight; y += gridSize) {
                graphics.fillCircle(x, y, 4);
            }
        }

        // Double-layered neon energy barrier around the map perimeter
        graphics.lineStyle(18, 0xf43f5e, 0.25);
        graphics.strokeRect(10, 10, mapWidth - 20, mapHeight - 20);
        graphics.lineStyle(6, 0xfb7185, 0.9);
        graphics.strokeRect(10, 10, mapWidth - 20, mapHeight - 20);
    }

    private openLevelUpModal(player: Player) {
        if (!player.active) return;
        if (this.scene.isActive(GameConstants.SceneKeys.LEVEL_UP)) return;
        if (this.scene.isActive(GameConstants.SceneKeys.PAUSE)) {
            this.scene.stop(GameConstants.SceneKeys.PAUSE);
        }

        if (!this.scene.isPaused(GameConstants.SceneKeys.MAIN_GAME)) {
            this.scene.pause(GameConstants.SceneKeys.MAIN_GAME);
        }
        this.scene.launch(GameConstants.SceneKeys.LEVEL_UP, { player });
    }

    private endGame() {
        const bestScore: number = Number(this.saveManager.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        const currentScore: number = Number(this.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        if (currentScore > bestScore) {
            this.saveManager.setData(SaveConstants.Keys.PLAYER_BEST_SCORE, currentScore);
            console.log("New Best Score: " + currentScore);
        }

        this.registry.set(RegistryConstants.Keys.PLAYER_LEVEL, this._player?.level ?? 1);
        this.scene.start(GameConstants.SceneKeys.GAME_OVER);
    }

    update(_timeSinceLaunch: number, _deltaTime: number) {
        const pad = this._gamepadTracker.poll(this);
        if (pad.pause) {
            this.openPauseModal();
        }
    }
}
