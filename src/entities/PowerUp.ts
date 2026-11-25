import { Physics, Scene } from 'phaser';
import { POWERUP_CONFIGS, PowerUpType } from '../gameData/PowerUpData.ts';

export default class PowerUp extends Physics.Arcade.Sprite {
    private _powerUpType: PowerUpType = PowerUpType.HEAL;
    private _despawnTimer?: Phaser.Time.TimerEvent;
    private _blinkTimer?: Phaser.Time.TimerEvent;

    public get powerUpType(): PowerUpType {
        return this._powerUpType;
    }

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites', 'star1');
    }

    public init() {
        this.scene.add.existing(this);
        this.scene.physics.add.existing(this);

        const body = this.body as Physics.Arcade.Body;
        body.allowGravity = false;
        body.setImmovable(true);
    }

    public enable(x: number, y: number, type: PowerUpType) {
        this._powerUpType = type;
        const config = POWERUP_CONFIGS[type];

        this.clearTimersAndTweens();

        this.setTexture('sprites', config.frame);
        this.setTint(config.tint);
        this.setAlpha(1);
        this.setScale(1.6);
        this.setDepth(5);

        this.enableBody(true, x, y, true, true);

        const body = this.body as Physics.Arcade.Body;
        const radius = Math.max(this.width, this.height) * 0.6;
        body.setCircle(radius, (this.width - radius * 2) / 2, (this.height - radius * 2) / 2);

        this.scene.tweens.add({
            targets: this,
            scale: 1.95,
            duration: 450,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Blink before despawn, then expire after 15s
        this._blinkTimer = this.scene.time.delayedCall(12000, () => {
            if (!this.active) return;
            this.scene.tweens.add({
                targets: this,
                alpha: 0.25,
                duration: 180,
                yoyo: true,
                repeat: -1,
            });
        });

        this._despawnTimer = this.scene.time.delayedCall(15000, () => {
            if (this.active) {
                this.disable();
            }
        });
    }

    public disable() {
        this.clearTimersAndTweens();
        this.disableBody(true, true);
    }

    private clearTimersAndTweens() {
        this.scene?.tweens.killTweensOf(this);
        this._blinkTimer?.remove(false);
        this._blinkTimer = undefined;
        this._despawnTimer?.remove(false);
        this._despawnTimer = undefined;
    }
}
