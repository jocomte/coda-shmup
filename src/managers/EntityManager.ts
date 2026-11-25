import { GameObjects, Plugins, Physics, Scene } from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import ExpGem from "../entities/ExpGem.ts";
import Player from "../entities/Player.ts";
import PowerUp from "../entities/PowerUp.ts";
import type { EnemiesData, EnemyTypeData } from "../gameData/EnemiesData.ts";
import { PowerUpType } from "../gameData/PowerUpData.ts";
import GroupUtils from "../utils/GroupUtils.ts";
import GameConstants from "../GameConstants.ts";
import RegistryConstants from "../RegistryConstants.ts";

export default class EntityManager extends Plugins.ScenePlugin {
    public static readonly PLUGIN_KEY: string = 'EntityManager';
    public static readonly MAPPING_NAME: string = 'entityManager';

    // noinspection JSUnusedGlobalSymbols
    private readonly bulletGroupConfig = {
        classType: Bullet,
        maxSize: 256,
        runChildUpdate: true,
        createCallback: (bullet: GameObjects.GameObject) => {
            (bullet as Bullet).init();
        }
    };

    private _player: Player;
    private _playerBullets: Physics.Arcade.Group;
    private _enemies: Physics.Arcade.Group;
    private _enemyBullets: Physics.Arcade.Group;
    private _powerUps: Physics.Arcade.Group;
    private _expGems: Physics.Arcade.Group;
    private _enemiesData: EnemiesData;
    private _spawnTimer?: Phaser.Time.TimerEvent;

    constructor(scene: Scene, pluginManager: Plugins.PluginManager) {
        super(scene, pluginManager, EntityManager.PLUGIN_KEY);

        console.log("[EntityManager] Initialized");
    }

    destroy() {
        super.destroy();

        console.log("[EntityManager] Destroyed");
    }

    public initAndSpawnPlayer(): Player {
        this._playerBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(128, this._playerBullets);

        // Enemies group must exist before player so auto-aim can track active enemies
        this._enemyBullets = this.scene!.physics.add.group(this.bulletGroupConfig);
        GroupUtils.populate(256, this._enemyBullets);

        this._player = new Player(
            this.scene!,
            GameConstants.MAP_WIDTH / 2,
            GameConstants.MAP_HEIGHT / 2
        );

        this._enemies = this.scene!.physics.add.group({
            classType: Enemy,
            maxSize: 48,
            defaultKey: 'sprites',
            defaultFrame: 'ufoRed',
            createCallback: (enemyObj) => {
                const enemy = enemyObj as Enemy;
                enemy.init(this._enemyBullets, this._player);
                enemy.getComponent(Health)?.on(Health.DEATH_EVENT, () => {
                    this.onEnemyKilled(enemy);
                });
            }
        });

        this._player.init(this._playerBullets, this._enemies);

        this._powerUps = this.scene!.physics.add.group({
            classType: PowerUp,
            maxSize: 32,
            defaultKey: 'sprites',
            defaultFrame: 'star1',
            createCallback: (powerUpObj) => {
                (powerUpObj as PowerUp).init();
            }
        });

        this._expGems = this.scene!.physics.add.group({
            classType: ExpGem,
            maxSize: 120,
            defaultKey: 'sprites',
            defaultFrame: 'expGem_small',
            createCallback: (gemObj) => {
                (gemObj as ExpGem).init(this._player);
            }
        });

        console.log("[EntityManager] Player spawned");

        this.game!.events.emit(GameConstants.Events.PLAYER_SPAWNED_EVENT, this._player);

        return this._player;
    }

    public initEnemies(): Physics.Arcade.Group {
        this._enemiesData = this.scene!.cache.json.get('enemies') as EnemiesData;

        // Spawn enemies indefinitely around the player
        this._spawnTimer = this.scene!.time.addEvent({
            delay: 1200,
            callback: this.onSpawnTick,
            callbackScope: this,
            loop: true
        });

        // Periodically spawn a random power-up on the map
        this.scene!.time.addEvent({
            delay: 15000,
            callback: this.spawnRandomMapPowerUp,
            callbackScope: this,
            loop: true
        });

        // Spawn a small initial wave right away so action starts immediately
        for (let i = 0; i < 4; i++) {
            this.spawnEnemy();
        }

        console.log("[EntityManager] Enemies initialized");

        return this._enemies;
    }

    public initGroupCollisions() {
        this.scene!.physics.add.overlap(this._playerBullets, this._enemies, (bulletObj, enemyObj) => {
            const bullet = bulletObj as Bullet;
            const enemy = enemyObj as Enemy;
            if (!bullet.active || !enemy.active) return;

            bullet.disable();
            enemy.getComponent(Health)?.damage(bullet.damage);
        });

        this.scene!.physics.add.overlap(this._player, this._enemyBullets, (playerObj, bulletObj) => {
            const bullet = bulletObj as Bullet;
            const player = playerObj as Player;
            if (!bullet.active || !player.active) return;

            bullet.disable();
            player.takeHitDamage(bullet.damage);

            this.scene?.cameras.main.shake(100, 0.01);
        });

        this.scene!.physics.add.overlap(this._player, this._enemies, (playerObj, enemyObj) => {
            const player = playerObj as Player;
            const enemy = enemyObj as Enemy;
            if (!player.active || !enemy.active) return;

            const contactDamage = enemy.contactDamage;
            const enemyHealth = enemy.getComponent(Health);
            enemyHealth?.damage(enemyHealth.max);

            player.takeHitDamage(contactDamage);

            this.scene?.cameras.main.shake(120, 0.025);
        });

        this.scene!.physics.add.overlap(this._player, this._powerUps, (playerObj, powerUpObj) => {
            const player = playerObj as Player;
            const powerUp = powerUpObj as PowerUp;
            if (!player.active || !powerUp.active) return;

            player.applyPowerUp(powerUp.powerUpType);
            powerUp.disable();
        });

        this.scene!.physics.add.overlap(this._player, this._expGems, (playerObj, gemObj) => {
            const player = playerObj as Player;
            const gem = gemObj as ExpGem;
            if (!player.active || !gem.active) return;

            const value = gem.expValue;
            gem.disable();
            player.gainExp(value);
        });

        console.log("[EntityManager] Group collisions initialized");
    }

    private onEnemyKilled(enemy: Enemy) {
        this.scene!.registry.inc(RegistryConstants.Keys.PLAYER_SCORE, enemy.scoreValue);

        this.spawnExpGemAt(enemy.x, enemy.y, enemy.expValue);

        if (Math.random() <= enemy.dropChance) {
            this.spawnPowerUpAt(enemy.x, enemy.y);
        }
    }

    private spawnExpGemAt(x: number, y: number, expValue: number) {
        const gem = this._expGems.get() as ExpGem;
        if (!gem) return;

        const margin = 64;
        const clampedX = Phaser.Math.Clamp(x, margin, GameConstants.MAP_WIDTH - margin);
        const clampedY = Phaser.Math.Clamp(y, margin, GameConstants.MAP_HEIGHT - margin);

        gem.enable(clampedX, clampedY, expValue);
    }

    private spawnPowerUpAt(x: number, y: number) {
        const powerUp = this._powerUps.get() as PowerUp;
        if (!powerUp) return;

        const types = Object.values(PowerUpType);
        const randomType = Phaser.Utils.Array.GetRandom(types);

        const margin = 80;
        const clampedX = Phaser.Math.Clamp(x, margin, GameConstants.MAP_WIDTH - margin);
        const clampedY = Phaser.Math.Clamp(y, margin, GameConstants.MAP_HEIGHT - margin);

        powerUp.enable(clampedX, clampedY, randomType);
    }

    private spawnRandomMapPowerUp() {
        if (!this._player || !this._player.active) return;
        if (this._powerUps.countActive(true) >= 6) return;

        const margin = 160;
        const x = Phaser.Math.Between(margin, GameConstants.MAP_WIDTH - margin);
        const y = Phaser.Math.Between(margin, GameConstants.MAP_HEIGHT - margin);
        this.spawnPowerUpAt(x, y);
    }

    private onSpawnTick() {
        const currentScore = Number(this.scene!.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        const playerLevel = this._player?.level ?? 1;

        // Gradually speed up spawns as player level & score grow
        if (this._spawnTimer) {
            const targetDelay = Math.max(420, 1200 - (playerLevel - 1) * 110 - currentScore * 5);
            this._spawnTimer.timeScale = 1200 / targetDelay;
        }

        this.spawnEnemy();
    }

    private pickEnemyType(currentScore: number, playerLevel: number): EnemyTypeData | undefined {
        if (!this._enemiesData) return undefined;

        const eligible: EnemyTypeData[] = Object.values(this._enemiesData).filter(
            entry => currentScore >= entry.minScoreToSpawn || playerLevel >= entry.minLevelToSpawn
        );

        if (eligible.length === 0) return undefined;

        // Higher level gradually shifts weight toward stronger enemies
        const weighted = eligible.map(entry => ({
            entry,
            weight: entry.scoreValue > 1
                ? entry.spawnWeight + Math.max(0, playerLevel - 1) * 6
                : entry.spawnWeight,
        }));

        const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
        let roll = Math.random() * totalWeight;

        for (const item of weighted) {
            roll -= item.weight;
            if (roll <= 0) {
                return item.entry;
            }
        }

        return eligible[0];
    }

    private getSpawnPositionAroundPlayer(): { x: number; y: number } {
        const margin = 96;
        const cam = this.scene!.cameras.main;
        const view = cam.worldView;
        const spawnPad = 80;

        // Pick one of the 4 sides around the camera viewport, clamped to the map
        const side = Phaser.Math.Between(0, 3);
        let x = this._player.x;
        let y = this._player.y;

        switch (side) {
            case 0: // Top
                x = Phaser.Math.Between(view.left - spawnPad, view.right + spawnPad);
                y = view.top - spawnPad;
                break;
            case 1: // Right
                x = view.right + spawnPad;
                y = Phaser.Math.Between(view.top - spawnPad, view.bottom + spawnPad);
                break;
            case 2: // Bottom
                x = Phaser.Math.Between(view.left - spawnPad, view.right + spawnPad);
                y = view.bottom + spawnPad;
                break;
            case 3: // Left
                x = view.left - spawnPad;
                y = Phaser.Math.Between(view.top - spawnPad, view.bottom + spawnPad);
                break;
        }

        x = Phaser.Math.Clamp(x, margin, GameConstants.MAP_WIDTH - margin);
        y = Phaser.Math.Clamp(y, margin, GameConstants.MAP_HEIGHT - margin);

        // If player is hugging a map edge and clamped spawn ended up too close, push across to the opposite side
        const minSafeDist = 420;
        const dist = Phaser.Math.Distance.Between(x, y, this._player.x, this._player.y);
        if (dist < minSafeDist) {
            x = this._player.x < GameConstants.MAP_WIDTH / 2
                ? Math.min(GameConstants.MAP_WIDTH - margin, this._player.x + 600)
                : Math.max(margin, this._player.x - 600);
            y = this._player.y < GameConstants.MAP_HEIGHT / 2
                ? Math.min(GameConstants.MAP_HEIGHT - margin, this._player.y + 600)
                : Math.max(margin, this._player.y - 600);
        }

        return { x, y };
    }

    private spawnEnemy() {
        if (!this._player || !this._player.active) return;

        const currentScore = Number(this.scene!.registry.get(RegistryConstants.Keys.PLAYER_SCORE) ?? 0);
        const playerLevel = this._player.level;
        const maxActive = Math.min(28, 6 + (playerLevel - 1) * 3 + Math.floor(currentScore / 10));
        if (this._enemies.countActive(true) >= maxActive) {
            return;
        }

        const enemy = this._enemies.get() as Enemy;
        if (!enemy) {
            return;
        }

        const enemyData = this.pickEnemyType(currentScore, playerLevel);
        const pos = this.getSpawnPositionAroundPlayer();

        enemy.enable(pos.x, pos.y, enemyData, playerLevel);

        this.game!.events.emit(GameConstants.Events.ENEMY_SPAWNED_EVENT, enemy);
    }
}
