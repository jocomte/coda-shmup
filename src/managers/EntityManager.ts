import { GameObjects, Plugins, Physics, Scene } from "phaser";
import Health from "../components/Health.ts";
import Bullet from "../entities/Bullet.ts";
import Enemy from "../entities/Enemy.ts";
import ExpGem from "../entities/ExpGem.ts";
import Player from "../entities/Player.ts";
import PowerUp from "../entities/PowerUp.ts";
import type { EnemiesData, EnemyTypeData } from "../gameData/EnemiesData.ts";
import { PowerUpType } from "../gameData/PowerUpData.ts";
import AudioManager from "../managers/AudioManager.ts";
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
    private _lastBossLevelSpawned: number = 0;
    private readonly _grazedBullets: WeakSet<Bullet> = new WeakSet();

    constructor(scene: Scene, pluginManager: Plugins.PluginManager) {
        super(scene, pluginManager, EntityManager.PLUGIN_KEY);

        console.log("[EntityManager] Initialized");
    }

    destroy() {
        super.destroy();

        console.log("[EntityManager] Destroyed");
    }

    public initAndSpawnPlayer(): Player {
        this._lastBossLevelSpawned = 0;

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
            delay: 1650,
            callback: this.onSpawnTick,
            callbackScope: this,
            loop: true
        });

        // Periodically spawn a random power-up on the map
        this.scene!.time.addEvent({
            delay: 14000,
            callback: this.spawnRandomMapPowerUp,
            callbackScope: this,
            loop: true
        });

        // Emit tactical radar snapshot + check bullet grazing
        this.scene!.time.addEvent({
            delay: 90,
            callback: this.onFastTick,
            callbackScope: this,
            loop: true
        });

        // Timed Boss wave every 60s if no boss is active
        this.scene!.time.addEvent({
            delay: 60000,
            callback: this.trySpawnBoss,
            callbackScope: this,
            loop: true
        });

        // Gentle initial wave so player can get their bearings
        for (let i = 0; i < 2; i++) {
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
            if (bullet.hasHit(enemy)) return;

            enemy.getComponent(Health)?.damage(bullet.damage);
            this._player.addOverdrive(1.5);

            if (bullet.registerHitAndShouldDisable(enemy)) {
                bullet.disable();
            }
        });

        this.scene!.physics.add.overlap(this._player, this._enemyBullets, (playerObj, bulletObj) => {
            const bullet = bulletObj as Bullet;
            const player = playerObj as Player;
            if (!bullet.active || !player.active) return;
            if (player.isDashing) return;

            bullet.disable();
            player.takeHitDamage(bullet.damage);

            this.scene?.cameras.main.shake(100, 0.01);
        });

        this.scene!.physics.add.overlap(this._player, this._enemies, (playerObj, enemyObj) => {
            const player = playerObj as Player;
            const enemy = enemyObj as Enemy;
            if (!player.active || !enemy.active) return;
            if (player.isDashing) return;

            const contactDamage = enemy.contactDamage;
            if (!enemy.isBoss) {
                const enemyHealth = enemy.getComponent(Health);
                enemyHealth?.damage(enemyHealth.max);
            }

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
        this._player.registerKill(enemy.scoreValue);

        if (enemy.isBoss) {
            this.scene?.cameras.main.shake(260, 0.025);
            for (let i = 0; i < 3; i++) {
                this.spawnExpGemAt(
                    enemy.x + Phaser.Math.Between(-50, 50),
                    enemy.y + Phaser.Math.Between(-50, 50),
                    Math.ceil(enemy.expValue / 3)
                );
            }
            this.spawnPowerUpAt(enemy.x, enemy.y);
            return;
        }

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

        // Smooth, gradual spawn speed-up as player level & score grow
        if (this._spawnTimer) {
            const targetDelay = Math.max(550, 1650 - (playerLevel - 1) * 95 - currentScore * 2);
            this._spawnTimer.timeScale = 1650 / targetDelay;
        }

        // Trigger a Boss wave at level 3, 6, 9...
        if (playerLevel >= 3 && playerLevel % 3 === 0 && this._lastBossLevelSpawned < playerLevel) {
            this._lastBossLevelSpawned = playerLevel;
            this.trySpawnBoss();
        }

        this.spawnEnemy();
    }

    private hasActiveBoss(): boolean {
        const children = this._enemies?.getChildren() ?? [];
        for (let i = 0; i < children.length; i++) {
            const e = children[i] as Enemy;
            if (e.active && e.isBoss) return true;
        }
        return false;
    }

    private trySpawnBoss() {
        if (!this._player || !this._player.active || this.hasActiveBoss()) return;
        const bossData = this._enemiesData?.['boss'];
        if (!bossData) return;

        const boss = this._enemies.get() as Enemy;
        if (!boss) return;

        const pos = this.getSpawnPositionAroundPlayer();
        boss.enable(pos.x, pos.y, bossData, this._player.level);

        const audio = this.game!.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        audio?.playSfx('sfx_boss_alert', 0.85);
        this.game!.events.emit(GameConstants.Events.BOSS_ALERT_EVENT, bossData.name ?? 'BOSS');
    }

    private onFastTick() {
        this.checkBulletGraze();
        this.emitRadarUpdate();
    }

    private checkBulletGraze() {
        if (!this._player || !this._player.active || this._player.isDashing) return;

        const innerDistSq = 40 * 40;
        const grazeDistSq = 88 * 88;
        const bullets = this._enemyBullets?.getChildren() ?? [];

        for (let i = 0; i < bullets.length; i++) {
            const b = bullets[i] as Bullet;
            if (!b.active || this._grazedBullets.has(b)) continue;

            const dx = b.x - this._player.x;
            const dy = b.y - this._player.y;
            const distSq = dx * dx + dy * dy;

            if (distSq >= innerDistSq && distSq <= grazeDistSq) {
                this._grazedBullets.add(b);
                this._player.registerGraze();
                // Clear marker when bullet leaves so pooled bullet can be grazed again later
                this.scene?.time.delayedCall(900, () => this._grazedBullets.delete(b));
            }
        }
    }

    private emitRadarUpdate() {
        if (!this._player || !this._player.active) return;

        const mapW = GameConstants.MAP_WIDTH;
        const mapH = GameConstants.MAP_HEIGHT;

        const enemies: Array<{ nx: number; ny: number; isBoss?: boolean }> = [];
        const enemyChildren = this._enemies?.getChildren() ?? [];
        for (let i = 0; i < enemyChildren.length; i++) {
            const e = enemyChildren[i] as Enemy;
            if (!e.active) continue;
            enemies.push({ nx: e.x / mapW, ny: e.y / mapH, isBoss: e.isBoss });
        }

        const powerUps: Array<{ nx: number; ny: number }> = [];
        const powerUpChildren = this._powerUps?.getChildren() ?? [];
        for (let i = 0; i < powerUpChildren.length; i++) {
            const p = powerUpChildren[i] as PowerUp;
            if (!p.active) continue;
            powerUps.push({ nx: p.x / mapW, ny: p.y / mapH });
        }

        this.scene?.game.events.emit(GameConstants.Events.RADAR_UPDATE_EVENT, {
            player: { nx: this._player.x / mapW, ny: this._player.y / mapH },
            enemies,
            powerUps,
        });
    }

    private pickEnemyType(currentScore: number, playerLevel: number): EnemyTypeData | undefined {
        if (!this._enemiesData) return undefined;

        const eligible: EnemyTypeData[] = Object.values(this._enemiesData).filter(
            entry => !entry.isBoss && entry.spawnWeight > 0 &&
                (currentScore >= entry.minScoreToSpawn || playerLevel >= entry.minLevelToSpawn)
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
        const maxActive = Math.min(24, 5 + (playerLevel - 1) * 2 + Math.floor(currentScore / 18));
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
