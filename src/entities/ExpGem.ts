import { Physics, Scene } from 'phaser';
import Player from './Player.ts';

export default class ExpGem extends Physics.Arcade.Sprite {
    private _expValue: number = 1;
    private _target?: Player;
    private _isMagnetized: boolean = false;
    private _despawnTimer?: Phaser.Time.TimerEvent;

    public get expValue(): number {
        return this._expValue;
    }

    constructor(scene: Scene, x: number, y: number) {
        super(scene, x, y, 'sprites', 'expGem_small');
    }

    public init(target: Player) {
        this._target = target;
        this.scene.add.existing(this);
        this.scene.physics.add.existing(this);

        const body = this.body as Physics.Arcade.Body;
        body.allowGravity = false;
    }

    public enable(x: number, y: number, expValue: number) {
        this._expValue = expValue;
        this._isMagnetized = false;

        this.clearTimersAndTweens();

        const frame = expValue >= 4 ? 'expGem_large' : 'expGem_small';
        this.setTexture('sprites', frame);
        this.setScale(0.35);
        this.setAlpha(1);
        this.setDepth(4);

        this.enableBody(true, x, y, true, true);

        const body = this.body as Physics.Arcade.Body;
        body.setVelocity(0, 0);
        const radius = Math.max(this.width, this.height) * 0.65;
        body.setCircle(radius, (this.width - radius * 2) / 2, (this.height - radius * 2) / 2);

        this.scene.tweens.add({
            targets: this,
            scale: 1.05,
            duration: 240,
            ease: 'Back.easeOut',
        });

        this._despawnTimer = this.scene.time.delayedCall(30000, () => {
            if (this.active) {
                this.disable();
            }
        });
    }

    public disable() {
        this.clearTimersAndTweens();
        this.disableBody(true, true);
    }

    preUpdate(time: number, delta: number) {
        super.preUpdate(time, delta);

        if (!this.active || !this._target || !this._target.active)
            return;

        const dx = this._target.x - this.x;
        const dy = this._target.y - this.y;
        const distSq = dx * dx + dy * dy;
        const pickupRadius = this._target.pickupRadius;

        if (!this._isMagnetized && distSq <= pickupRadius * pickupRadius) {
            this._isMagnetized = true;
        }

        if (this._isMagnetized && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const pullSpeed = 0.78;
            this.x += (dx / dist) * pullSpeed * delta;
            this.y += (dy / dist) * pullSpeed * delta;
        }
    }

    private clearTimersAndTweens() {
        this.scene?.tweens.killTweensOf(this);
        this._despawnTimer?.remove(false);
        this._despawnTimer = undefined;
    }
}
