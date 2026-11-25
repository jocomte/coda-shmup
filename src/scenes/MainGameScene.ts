import { Scene } from 'phaser';
import Health from "../components/Health.ts";
import RegistryConstants from "../RegistryConstants.ts";
import SaveManager from "../managers/SaveManager.ts";
import SaveConstants from "../SaveConstants.ts";
import EntityManager from "../managers/EntityManager.ts";
import GameConstants from "../GameConstants.ts";

export default class MainGameScene extends Scene {
    private saveManager: SaveManager;
    private entityManager: EntityManager;

    constructor() {
        super(GameConstants.SceneKeys.MAIN_GAME);
    }

    // noinspection JSUnusedGlobalSymbols
    create() {
        if (!this.saveManager) {
            console.error('SaveManager plugin not found');
        }
        this.saveManager?.load();

        const mapWidth = GameConstants.MAP_WIDTH;
        const mapHeight = GameConstants.MAP_HEIGHT;

        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

        this.add.tileSprite(0, 0, mapWidth, mapHeight, 'bg')
            .setOrigin(0, 0)
            .setTileScale(2);

        this.add.image(mapWidth * 0.5, mapHeight * 0.35, 'planet')
            .setAlpha(0.45);

        this.drawArenaBounds(mapWidth, mapHeight);

        if (!this.entityManager) {
            console.error('EntityManager plugin not found');
        }

        const player = this.entityManager.initAndSpawnPlayer();
        player.getComponent(Health)?.once(Health.DEATH_EVENT, () => {
            // Hide the player and let its explosion play before showing the game over screen
            player.disableBody(true, true);
            this.time.delayedCall(1000, this.endGame, [], this);
        }, this);

        this.cameras.main.startFollow(player, true, 0.12, 0.12);

        this.entityManager.initEnemies();
        this.entityManager.initGroupCollisions();

        if (this.input.keyboard) {
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R).on('down', () => this.scene.restart());
        } else {
            console.error('No keyboard input');
        }

        this.registry.set(RegistryConstants.Keys.PLAYER_SCORE, 0);

        console.log("MainGameScene created");
    }

    private drawArenaBounds(mapWidth: number, mapHeight: number) {
        const graphics = this.add.graphics().setDepth(1);

        // Subtle arena grid for spatial movement feedback
        graphics.lineStyle(2, 0x6366f1, 0.16);
        const gridSize = 180;
        for (let x = gridSize; x < mapWidth; x += gridSize) {
            graphics.lineBetween(x, 0, x, mapHeight);
        }
        for (let y = gridSize; y < mapHeight; y += gridSize) {
            graphics.lineBetween(0, y, mapWidth, y);
        }

        // Visible outer map barrier
        graphics.lineStyle(12, 0xf43f5e, 0.85);
        graphics.strokeRect(6, 6, mapWidth - 12, mapHeight - 12);
    }

    private endGame() {
        const bestScore: number = Number(this.saveManager.getData(SaveConstants.Keys.PLAYER_BEST_SCORE) ?? 0);
        const currentScore: number = Number(this.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        if (currentScore > bestScore) {
            this.saveManager.setData(SaveConstants.Keys.PLAYER_BEST_SCORE, currentScore);
            console.log("New Best Score: " + currentScore);
        }

        this.scene.start(GameConstants.SceneKeys.GAME_OVER);
    }

    update(_timeSinceLaunch: number, _deltaTime: number) {
        // Arena is static in world space; camera follows the player
    }
}
