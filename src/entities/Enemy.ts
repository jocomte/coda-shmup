import { GameObjects } from 'phaser';
import type { BulletData } from '../gameData/BulletData.ts';
import type { EnemyTypeData } from '../gameData/EnemiesData.ts';
import GameConstants from '../GameConstants.ts';
import Entity from './Entity.ts';
import AudioManager from "../managers/AudioManager.ts";
import Health from "../components/Health.ts";
import Movement from "../components/Movement.ts";
import Weapon from "../components/Weapon.ts";

function parseColor(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export default class Enemy extends Entity {
    private static readonly HP_BAR_WIDTH: number = 64;
    private static readonly HP_BAR_HEIGHT: number = 8;

    private readonly _defaultBulletData: BulletData = {
        width: 16,
        height: 16,
        color: 0xf25f5c,
        speed: 410,
        damage: 10,
        frame: 'bullet_enemy',
    };

    private _enemyData?: EnemyTypeData;
    private _target?: Entity;
    private _shootTimerConfig: Phaser.Types.Time.TimerEventConfig;
    private _shootTimer: Phaser.Time.TimerEvent;
    private _isHitFlashing: boolean = false;
    private _elapsedTime: number = 0;
    private _contactDamage: number = 12;
    private _lastRecordedHp: number = 1;
    private readonly _moveDir: Phaser.Math.Vector2 = new Phaser.Math.Vector2();

    private _hpBarBg?: GameObjects.Rectangle;
    private _hpBarFill?: GameObjects.Rectangle;

    public get scoreValue(): number {
        return this._enemyData?.scoreValue ?? 1;
    }

    public get expValue(): number {
        return this._enemyData?.expValue ?? 1;
    }

    public get contactDamage(): number {
        return this._contactDamage;
    }

    public get dropChance(): number {
        return this._enemyData?.dropChance ?? 0.22;
    }

    public get isBoss(): boolean {
        return Boolean(this._enemyData?.isBoss);
    }

    public init(bulletsGroup: Phaser.Physics.Arcade.Group, target: Entity) {
        this._target = target;

        this.addComponent(new Health(1, this));
        this.addComponent(new Movement(0.16));
        this.addComponent(new Weapon(bulletsGroup, this._defaultBulletData));

        this._hpBarBg = this.scene.add.rectangle(this.x, this.y, Enemy.HP_BAR_WIDTH, Enemy.HP_BAR_HEIGHT, 0x0f172a, 0.85)
            .setStrokeStyle(1, 0x475569, 0.9)
            .setDepth(14)
            .setVisible(false);
        this._hpBarFill = this.scene.add.rectangle(this.x, this.y, Enemy.HP_BAR_WIDTH - 2, Enemy.HP_BAR_HEIGHT - 2, 0xf43f5e, 1)
            .setOrigin(0, 0.5)
            .setDepth(15)
            .setVisible(false);

        this.once(GameObjects.Events.DESTROY, () => {
            this._hpBarBg?.destroy();
            this._hpBarFill?.destroy();
        });

        // Listen once per enemy, not on every enable(): pooled enemies are reused many times
        const health = this.getComponent(Health);
        health?.on(Health.CHANGE_EVENT, () => {
            const dmgTaken = Math.max(1, this._lastRecordedHp - health.current);
            this._lastRecordedHp = health.current;

            if (this.active && health.max > 1) {
                this.showDamagePopup(dmgTaken);
            }

            this._isHitFlashing = true;
            this.setTintFill(0xffffff);
            this.updateHpBar(health.current, health.max);

            if (this.isBoss) {
                this.emitBossStatus(health.current > 0, health.current, health.max);
            }

            if (health.current === 0) {
                this.disableBody();
                this.hideHpBar();
            }

            this.scene.time.delayedCall(55, () => {
                this._isHitFlashing = false;
                this.applyBaseTint();

                if (health.current === 0) {
                    this.disable();
                }
            });
        });

        this._shootTimerConfig = {
            delay: 2800,
            callback: this.shoot,
            callbackScope: this,
            loop: true
        };
        this._shootTimer = this.scene.time.addEvent(this._shootTimerConfig);
        this._shootTimer.paused = true;

        // Create animation when UFO enemy is about to shoot in the global animation manager
        if (!this.scene.anims.exists('ufoShoot')) {
            this.scene.anims.create({
                key: 'ufoShoot',
                frames: [
                    { key: 'sprites', frame: 'ufoRed' },
                    { key: 'sprites', frame: 'ufoRed-shoot0' },
                    { key: 'sprites', frame: 'ufoRed-shoot1' }
                ],
                frameRate: 4,
            });
        }
    }

    public enable(x: number, y: number, data?: EnemyTypeData, playerLevel: number = 1) {
        this._enemyData = data;
        this._isHitFlashing = false;
        this._elapsedTime = 0;

        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
        this.hideHpBar();

        const textureFrame = data?.texture ?? 'ufoRed';
        const scale = data?.scale ?? 1;

        this.setTexture('sprites', textureFrame);
        this.setScale(scale);
        this.applyBaseTint();

        this.enableBody(true, x, y, true, true);
        this.setDepth(this.isBoss ? 9 : 8);

        const bodyRadius = Math.min(this.width, this.height) * 0.42;
        this.arcadeBody.setCircle(
            bodyRadius,
            (this.width - bodyRadius * 2) / 2,
            (this.height - bodyRadius * 2) / 2
        );

        // Smooth, progressive difficulty scaling based on player level
        const levelOffset = Math.max(0, playerLevel - 1);
        const hpScale = this.isBoss ? (1 + levelOffset * 0.24) : (1 + levelOffset * 0.22);
        const speedScale = 1 + Math.min(0.45, levelOffset * 0.045);
        const damageBonus = Math.min(14, Math.floor(levelOffset * 1.5));
        const fireCooldownScale = Math.max(0.75, Math.pow(0.97, levelOffset));

        const baseHealth = data?.health ?? 1;
        const scaledHealth = Math.max(1, Math.round(baseHealth * hpScale));
        const health = this.getComponent(Health);
        health?.setMax(scaledHealth, true);
        this._lastRecordedHp = scaledHealth;

        if (this.isBoss) {
            this.emitBossStatus(true, scaledHealth, scaledHealth);
        }

        this.getComponent(Movement)?.setSpeed((data?.movementSpeed ?? 0.16) * speedScale);

        this._contactDamage = (data?.contactDamage ?? 12) + damageBonus;

        const bulletColor = parseColor(data?.bullet.color) ?? 0xf25f5c;
        this.getComponent(Weapon)?.setBulletData({
            width: data?.bullet.width ?? 16,
            height: data?.bullet.height ?? 16,
            color: bulletColor,
            speed: (data?.bullet.speed ?? 410) * (1 + Math.min(0.3, levelOffset * 0.035)),
            damage: (data?.bullet.damage ?? 10) + damageBonus,
            frame: data?.bullet.frame ?? 'bullet_enemy',
        });

        const baseDelay = Phaser.Math.Between(
            data?.shootDelayMin ?? 2600,
            data?.shootDelayMax ?? 3600
        );
        this._shootTimerConfig.delay = Math.max(1200, Math.round(baseDelay * fireCooldownScale));
        this._shootTimer.reset(this._shootTimerConfig);
        this._shootTimer.paused = false;
    }

    public disable() {
        const wasBoss = this.isBoss;
        this.stop();
        this.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
        this.hideHpBar();

        this.disableBody(true, true);
        this._shootTimer.paused = true;

        if (wasBoss) {
            this.emitBossStatus(false, 0, 1);
        }
    }

    private showDamagePopup(amount: number) {
        const txt = this.scene.add.text(
            this.x + Phaser.Math.Between(-16, 16),
            this.y - this.displayHeight * 0.45,
            `-${amount}`,
            {
                fontSize: amount >= 3 ? '26px' : '20px',
                fontFamily: 'future, sans-serif',
                color: amount >= 3 ? '#fde047' : '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
            }
        ).setOrigin(0.5).setDepth(22);

        this.scene.tweens.add({
            targets: txt,
            y: txt.y - 38,
            alpha: 0,
            duration: 450,
            ease: 'Quad.easeOut',
            onComplete: () => txt.destroy(),
        });
    }

    private emitBossStatus(active: boolean, current: number, max: number) {
        this.scene.game.events.emit(GameConstants.Events.BOSS_STATUS_EVENT, {
            active,
            name: this._enemyData?.name ?? 'BOSS',
            current,
            max,
            x: this.x,
            y: this.y,
        });
    }

    private updateHpBar(current: number, max: number) {
        if (!this._hpBarBg || !this._hpBarFill) return;
        if (this.isBoss || max <= 1 || current <= 0 || current >= max) {
            this.hideHpBar();
            return;
        }

        const barY = this.y - this.displayHeight * 0.65;
        this._hpBarBg.setPosition(this.x, barY).setVisible(true);
        this._hpBarFill
            .setPosition(this.x - Enemy.HP_BAR_WIDTH / 2 + 1, barY)
            .setVisible(true);
        this._hpBarFill.width = (Enemy.HP_BAR_WIDTH - 2) * Phaser.Math.Clamp(current / max, 0, 1);
    }

    private hideHpBar() {
        this._hpBarBg?.setVisible(false);
        this._hpBarFill?.setVisible(false);
    }

    private applyBaseTint() {
        const tintColor = parseColor(this._enemyData?.tint);
        if (tintColor !== null) {
            this.setTint(tintColor);
        } else {
            this.clearTint();
        }
    }

    private fireWeapon() {
        if (!this.active || (this._target && !this._target.active))
            return;

        const bulletCount = this._enemyData?.bulletCount ?? 1;
        const spreadAngle = this._enemyData?.spreadAngle ?? 0;

        this.getComponent(Weapon)?.shoot(this, bulletCount, spreadAngle);
        const audio = this.scene.game.plugins.get(AudioManager.PLUGIN_KEY) as AudioManager | undefined;
        audio?.playSfx('sfx_laser2', 0.25);
    }

    private shoot() {
        if (!this.active || (this._target && !this._target.active))
            return;

        if (this._enemyData?.usesShootAnim) {
            this.play('ufoShoot');
            this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                if (!this.active) return;
                this.setTexture('sprites', this._enemyData?.texture ?? 'ufoRed');
                this.applyBaseTint();
                this.fireWeapon();
            });
        } else {
            this.fireWeapon();
        }
    }

    preUpdate(timeSinceLaunch: number, deltaTime: number) {
        super.preUpdate(timeSinceLaunch, deltaTime);

        if (!this.active || !this._target || !this._target.active)
            return;

        this._elapsedTime += deltaTime;

        // Home in towards the player
        const dx = this._target.x - this.x;
        const dy = this._target.y - this.y;
        this._moveDir.set(dx, dy);

        if (this._moveDir.lengthSq() > 0) {
            this._moveDir.normalize();
            this.rotation = this._moveDir.angle();

            const waveAmp = this._enemyData?.waveAmplitude ?? 0;
            const waveFreq = this._enemyData?.waveFrequency ?? 0;
            if (waveAmp > 0 && waveFreq > 0) {
                const waveOffset = Math.sin(this._elapsedTime * waveFreq) * waveAmp;
                const perpX = -this._moveDir.y;
                const perpY = this._moveDir.x;
                this._moveDir.x += perpX * waveOffset;
                this._moveDir.y += perpY * waveOffset;
                this._moveDir.normalize();
            }

            const moveDelta = this._isHitFlashing ? deltaTime * 0.5 : deltaTime;
            this.getComponent(Movement)?.move(this, this._moveDir, moveDelta);
        }

        // Keep enemies inside map bounds
        const bounds = this.scene.physics.world.bounds;
        const margin = Math.max(this.displayWidth, this.displayHeight) / 2;
        this.x = Phaser.Math.Clamp(this.x, bounds.left + margin, bounds.right - margin);
        this.y = Phaser.Math.Clamp(this.y, bounds.top + margin, bounds.bottom - margin);

        if (this._hpBarBg?.visible && this._hpBarFill?.visible) {
            const barY = this.y - this.displayHeight * 0.65;
            this._hpBarBg.setPosition(this.x, barY);
            this._hpBarFill.setPosition(this.x - Enemy.HP_BAR_WIDTH / 2 + 1, barY);
        }
    }
}
