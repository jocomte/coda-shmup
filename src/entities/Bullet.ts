import { BlendModes, Physics } from "phaser";
import type { BulletData } from "../gameData/BulletData.ts";

export default class Bullet extends Physics.Arcade.Sprite {
    private _arcadeBody: Physics.Arcade.Body;
    private _damage: number = 0;

    public get damage(): number {
        return this._damage;
    }

    public init() {
        this.scene.physics.add.existing(this);

        this._arcadeBody = this.body as Physics.Arcade.Body;
        this._arcadeBody.allowGravity = false;
        this._arcadeBody.setFriction(0, 0);
        this.setBlendMode(BlendModes.ADD);
        this.setDepth(9);
    }

    public enable(x: number, y: number, velocityX: number, velocityY: number, data: BulletData) {
        const frame = data.frame ?? 'bullet_player';
        this.setTexture('sprites', frame);
        this.setPosition(x, y);
        this.setOrigin(0.5);
        this.setScale(1);

        if (data.frame) {
            this.clearTint();
        } else {
            this.setTint(data.color);
        }

        this.scene.physics.world.add(this._arcadeBody);
        this.setActive(true);
        this.setVisible(true);

        this._arcadeBody.setVelocity(velocityX, velocityY);
        this._damage = data.damage;

        // Rotate the bullet to face the direction it's moving
        this.setRotation(this._arcadeBody.velocity.angle());

        // Arcade bodies can't rotate: fit the body to the rotated bullet bounds
        const cos: number = Math.abs(Math.cos(this.rotation));
        const sin: number = Math.abs(Math.sin(this.rotation));
        this._arcadeBody.setSize(
            data.width * cos + data.height * sin,
            data.width * sin + data.height * cos,
            true
        );
    }

    public disable() {
        this.scene.physics.world.disableBody(this._arcadeBody);
        this.setActive(false);
        this.setVisible(false);
    }

    update(timeSinceLaunch: number, deltaTime: number) {
        super.update(timeSinceLaunch, deltaTime);

        // Recycle bullets when they leave the map bounds
        const bounds = this.scene.physics.world.bounds;
        if (this.x < bounds.left - this.displayWidth || this.x > bounds.right + this.displayWidth
            || this.y < bounds.top - this.displayHeight || this.y > bounds.bottom + this.displayHeight) {
            this.disable();
        }
    }
}
