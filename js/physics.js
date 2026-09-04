// Faithful JS port of the Elasto Mania physics engine.
// Source: elma-miyoo (C port, itself a port of the original elma-classic sources):
//   - physics_init.cpp  -> constants, motor geometry
//   - LEPTET.CPP        -> the main physics step (springs, gas/brake, volt, rider)
//   - physics_move.cpp  -> rigidbody integration + wheel/ground collision
//   - physics_collision.cpp -> anchor points (wheel vs polygon segments)
// Units: meters, seconds, radians, kilograms. Y is UP.
window.EM = window.EM || {};

EM.Physics = (function () {
  const V = EM.V;
  const PI = Math.PI;
  const TWO_PI = 2 * Math.PI;
  const HALF_PI = Math.PI / 2;

  // ---- physics constants (physics_init.cpp) ----
  const C = {
    GroundEscapeVelocity: 0.01, // m/s : perpendicular velocity to detach from ground
    WheelDeformationLength: 0.005, // m : wheel sink into ground
    Gravity: 10.0, // m/s^2
    TwoPointDiscriminationDistance: 0.1, // m : min distance between two collision vertices
    VoltDelay: 0.4, // s : min time between volts
    LevelEndDelay: 1.0, // s
    SpringTensionCoefficient: 10000.0, // N/m (wheel springs)
    SpringResistanceCoefficient: 1000.0, // N/(m/s) (wheel dampers)
    HeadRadius: 0.238, // m
    ObjectRadius: 0.4, // m
  };

  // ---- motor geometry (init_motor) ----
  function newRigidBody(rotation, radius, mass, inertia, x, y) {
    return {
      rotation: rotation,
      angular_velocity: 0,
      radius: radius,
      mass: mass,
      inertia: inertia,
      r: { x: x, y: y },
      v: { x: 0, y: 0 },
      // debug: anchor contact info from last step
      contact: 0,
    };
  }

  function newMotor() {
    return {
      bike: newRigidBody(0, 0.3, 200, 200 * 0.55 * 0.55, 2.75, 3.6),
      left_wheel: newRigidBody(0, 0.4, 10, 0.32, 1.9, 3.0),
      right_wheel: newRigidBody(0, 0.4, 10, 0.32, 3.6, 3.0),
      head_r: { x: 0, y: 0 },
      prev_head_r: { x: 0, y: 0 },
      flipped_bike: 0,
      flipped_camera: 0,
      gravity_direction: 1, // 0=up 1=down 2=left 3=right (matches elma-classic gravirany)
      body_r: { x: 2.75, y: 4.04 }, // rider hip
      body_v: { x: 0, y: 0 },
      apple_count: 0,
      prev_brake: 0,
      left_wheel_brake_rotation: 0,
      right_wheel_brake_rotation: 0,
      volting_right: 0,
      volting_left: 0,
      right_volt_time: -1,
      left_volt_time: -1,
      angular_velocity_pre_right_volt: -1,
      angular_velocity_pre_left_volt: -1,
      // debug state
      max_friction: 0,
      last_volt_time: -100.0,
      last_volt_side: 1,
      last_turn_time: -100.0,
    };
  }

  // wheel anchor offsets relative to bike center (rotated by bike.rotation)
  const LeftWheelDX = 1.9 - 2.75; // -0.85
  const LeftWheelDY = 3.0 - 3.6; // -0.6
  const RightWheelDX = 3.6 - 2.75; // 0.85
  const RightWheelDY = 3.0 - 3.6; // -0.6
  const BodyDY = 4.04 - 3.6; // 0.44

  // gravity unit vectors for each gravity direction (up, down, left, right)
  // Matches original elma-classic: gravirany 0=UP(+j), 1=DOWN(-j), 2=LEFT(-i), 3=RIGHT(+i)
  const GRAV = [
    { x: 0, y: 1 },   // 0 = UP
    { x: 0, y: -1 },  // 1 = DOWN (normal)
    { x: -1, y: 0 },  // 2 = LEFT
    { x: 1, y: 0 },   // 3 = RIGHT
  ];

  const Loket = 12.0; // volt angular kick (rad/s)
  const Omegavalt = 3.0; // persistent angular change per volt

  // ------------------------------------------------------------------
  // collision: anchor points (physics_collision.cpp)
  // ------------------------------------------------------------------

  // Closest point on segment to circle center, or null.
  function get_anchor_point(r, radius, seg) {
    const rel = V.sub(r, seg.r);
    const position_along_line = V.dot(rel, seg.unit);
    if (position_along_line < 0) {
      if (V.len(V.sub(r, seg.r)) < radius) return { x: seg.r.x, y: seg.r.y };
      return null;
    }
    if (position_along_line > seg.length) {
      const end = V.add(seg.r, V.mul(seg.unit, seg.length));
      if (V.len(V.sub(r, end)) < radius) return { x: end.x, y: end.y };
      return null;
    }
    const n = V.rot90(seg.unit);
    const distance = V.dot(rel, n);
    if (distance < -radius || distance > radius) return null;
    return V.add(seg.r, V.mul(seg.unit, position_along_line));
  }

  // Returns { count, p1, p2 } up to two contact points between the circle and segments.
  function get_two_anchor_points(r, radius, segs) {
    let anchor_point_count = 0;
    let point1 = { x: 0, y: 0 };
    let point2 = { x: 0, y: 0 };
    for (let i = 0; i < segs.length; i++) {
      const point = get_anchor_point(r, radius, segs[i]);
      if (!point) continue;
      if (anchor_point_count === 2) {
        throw new Error("anchor_point_count == 2");
      }
      if (anchor_point_count === 1) {
        point2 = point;
        anchor_point_count++;
        // Two contacts too close together -> treat as one (vertex touch).
        if (V.len(V.sub(point1, point2)) < C.TwoPointDiscriminationDistance) {
          point1 = V.mul(V.add(point1, point2), 0.5);
          anchor_point_count = 1;
        } else {
          return { count: anchor_point_count, p1: point1, p2: point2 };
        }
      }
      if (anchor_point_count === 0) {
        point1 = point;
        anchor_point_count++;
      }
    }
    return { count: anchor_point_count, p1: point1, p2: point2 };
  }

  // ------------------------------------------------------------------
  // rigidbody movement (physics_move.cpp)
  // ------------------------------------------------------------------

  // Push the wheel out of the ground so it stands on the anchor point.
  function move_wheel_out_of_ground(rb, point) {
    const diff = V.sub(rb.r, point);
    const length = V.len(diff);
    const n = V.mul(diff, 1 / length);
    if (length < rb.radius - C.WheelDeformationLength) {
      rb.r = V.add(rb.r, V.mul(n, rb.radius - C.WheelDeformationLength - length));
    }
  }

  // Handle collision between a wheel and one anchor point.
  // Deletes the velocity towards the point, keeps perpendicular velocity.
  function simulate_anchor_point_collision(rb, point, force) {
    const diff = V.sub(rb.r, point);
    const length = V.len(diff);
    const n = V.mul(diff, 1 / length);
    if (V.dot(n, rb.v) > -C.GroundEscapeVelocity && V.dot(n, force) > 0) {
      return false;
    }
    const deleted_velocity = V.mul(n, V.dot(n, rb.v));
    rb.v = V.sub(rb.v, deleted_velocity);
    const bump_magnitude = V.len(deleted_velocity);
    if (bump_magnitude > 1.5) {
      EM.Physics.events.push({ type: "bump", vol: Math.min(0.99, bump_magnitude / 0.8 * 0.1) });
    }
    return true;
  }

  // Wheel stuck check (original Across behavior): consider only force/torque.
  function valid_anchor_points_old(point1, point2, rb, force, torque) {
    const diff = V.sub(rb.r, point2);
    const length = V.len(diff);
    const n = V.mul(diff, 1 / length);
    const n90 = V.rot90(n);
    const total_torque = torque + length * V.dot(n90, force);
    return !(V.dot(V.sub(point1, point2), n90) * total_torque < 0);
  }

  // Wheel stuck check (Elma-exclusive): consider velocity.
  function valid_anchor_points_new(point1, point2, rb) {
    const diff = V.sub(rb.r, point2);
    const length = V.len(diff);
    const n = V.mul(diff, 1 / length);
    const n90 = V.rot90(n);
    const speed_direction = rb.angular_velocity + length * V.dot(n90, rb.v);
    return !(V.dot(V.sub(point1, point2), n90) * speed_direction < 0);
  }

  // Integrate one rigid body. do_collision = true for solid bodies (wheels),
  // false for the bike frame.
  function rigidbody_movement(rb, force, torque, dt, do_collision, segs) {
    let anchor_point_count = 0;
    let point1 = { x: 0, y: 0 };
    let point2 = { x: 0, y: 0 };
    if (do_collision) {
      const res = get_two_anchor_points(rb.r, rb.radius, segs);
      anchor_point_count = res.count;
      point1 = res.p1;
      point2 = res.p2;
    }
    rb.contact = anchor_point_count;

    if (anchor_point_count > 0) move_wheel_out_of_ground(rb, point1);
    if (anchor_point_count > 1) move_wheel_out_of_ground(rb, point2);

    // Two contacts: discard one if the wheel is sliding away from it.
    if (anchor_point_count === 2 && V.len(rb.v) > 1.0) {
      if (!valid_anchor_points_new(point1, point2, rb)) {
        anchor_point_count = 1;
        point1 = point2;
      } else if (!valid_anchor_points_new(point2, point1, rb)) {
        anchor_point_count = 1;
      }
    }
    if (anchor_point_count === 2 && V.len(rb.v) < 1.0) {
      if (!valid_anchor_points_old(point1, point2, rb, force, torque)) {
        anchor_point_count = 1;
        point1 = point2;
      } else if (!valid_anchor_points_old(point2, point1, rb, force, torque)) {
        anchor_point_count = 1;
      }
    }

    // Check whether we actually collide with the remaining points.
    if (anchor_point_count === 2) {
      if (!simulate_anchor_point_collision(rb, point2, force)) anchor_point_count = 1;
    }
    if (anchor_point_count >= 1) {
      if (!simulate_anchor_point_collision(rb, point1, force)) {
        if (anchor_point_count === 2) {
          anchor_point_count = 1;
          point1 = point2;
        } else {
          anchor_point_count = 0;
        }
      }
    }
    rb.contact = anchor_point_count;

    // No collision: normal dynamics.
    if (anchor_point_count === 0) {
      const angular_acceleration = torque / rb.inertia;
      rb.angular_velocity += angular_acceleration * dt;
      rb.rotation += rb.angular_velocity * dt;
      const a = V.mul(force, 1 / rb.mass);
      rb.v = V.add(rb.v, V.mul(a, dt));
      rb.r = V.add(rb.r, V.mul(rb.v, dt));
      return;
    }
    // Two contacts: stuck.
    if (anchor_point_count === 2) {
      rb.v = { x: 0, y: 0 };
      rb.angular_velocity = 0;
      return;
    }

    // One contact: roll the wheel on the ground.
    const diff = V.sub(rb.r, point1);
    const length = V.len(diff);
    const n = V.mul(diff, 1 / length);
    const n90 = V.rot90(n);
    rb.angular_velocity = V.dot(rb.v, n90) * (1 / rb.radius);
    torque += V.dot(force, n90) * rb.radius;
    // Parallel axis theorem: moment of inertia when rolling on the ground.
    const inertia_edge = rb.inertia + rb.mass * length * length;
    const angular_acceleration = torque / inertia_edge;
    rb.angular_velocity += angular_acceleration * dt;
    rb.rotation += rb.angular_velocity * dt;
    rb.v = V.mul(n90, rb.angular_velocity * rb.radius);
    rb.r = V.add(rb.r, V.mul(rb.v, dt));
  }

  // ------------------------------------------------------------------
  // rider body (physics_move.cpp body_movement / body_boundaries)
  // ------------------------------------------------------------------

  // Rider body allowed region, relative to the bike center, rotated by i,j.
  const BODY_LINE_POINT = { x: -0.35, y: 0.13 };
  const BODY_LINE_SLOPE = { x: 0.14 - -0.35, y: 0.36 - 0.13 };
  const BODY_LINE_SLOPE_ORTHO = { x: -BODY_LINE_SLOPE.y, y: BODY_LINE_SLOPE.x };
  const BODY_LINE_SLOPE_ORTHO_UNIT = V.unit(BODY_LINE_SLOPE_ORTHO);
  const BODY_ELLIPSE_HEIGHT = 0.48;
  const BODY_ELLIPSE_WIDTH = 0.26;
  const BODY_ELLIPSE_R2 = BODY_ELLIPSE_HEIGHT * BODY_ELLIPSE_HEIGHT;
  const BODY_ELLIPSE_R = Math.sqrt(BODY_ELLIPSE_R2);
  const BODY_ELLIPSE_A2 =
    (BODY_ELLIPSE_HEIGHT / BODY_ELLIPSE_WIDTH) * (BODY_ELLIPSE_HEIGHT / BODY_ELLIPSE_WIDTH);

  function body_boundaries(mot, i, j) {
    let body_x, body_y;
    if (mot.flipped_bike) {
      body_x = V.dot(i, V.sub(mot.bike.r, mot.body_r));
      body_y = V.dot(j, V.sub(mot.body_r, mot.bike.r));
    } else {
      body_x = V.dot(i, V.sub(mot.body_r, mot.bike.r));
      body_y = V.dot(j, V.sub(mot.body_r, mot.bike.r));
    }
    let br = { x: body_x, y: body_y };

    // Restrict bottom with a diagonal line.
    if (V.dot(V.sub(br, BODY_LINE_POINT), BODY_LINE_SLOPE_ORTHO_UNIT) < 0.0) {
      const distance = V.dot(V.sub(br, BODY_LINE_POINT), BODY_LINE_SLOPE_ORTHO_UNIT);
      br = V.sub(br, V.mul(BODY_LINE_SLOPE_ORTHO_UNIT, distance));
    }
    // Restrict top / front / back.
    if (br.y > BODY_ELLIPSE_HEIGHT) br.y = BODY_ELLIPSE_HEIGHT;
    if (br.x < -0.5) br.x = -0.5;
    if (br.x > BODY_ELLIPSE_WIDTH) br.x = BODY_ELLIPSE_WIDTH;
    // Restrict back-top corner with an ellipse.
    if (br.x > 0 && br.y > 0) {
      const distance2 = br.x * br.x * BODY_ELLIPSE_A2 + br.y * br.y;
      if (distance2 > BODY_ELLIPSE_R2) {
        const distance = Math.sqrt(distance2);
        const ratio = BODY_ELLIPSE_R / distance;
        br.x *= ratio;
        br.y *= ratio;
      }
    }

    if (mot.flipped_bike) {
      mot.body_r = V.add(V.sub(V.mul(j, br.y), V.mul(i, br.x)), mot.bike.r);
    } else {
      mot.body_r = V.add(V.add(V.mul(i, br.x), V.mul(j, br.y)), mot.bike.r);
    }
  }

  // Rider body: spring (5x wheel tension) + damping (3x wheel resistance).
  function body_movement(mot, gravity, i, j, dt) {
    body_boundaries(mot, i, j);

    const neutral_body_r = V.add(mot.bike.r, V.mul(j, BodyDY));
    const delta_body_r = V.sub(neutral_body_r, mot.body_r);
    let spring_length = V.len(delta_body_r);
    if (spring_length < 0.0000001) spring_length = 0.0000001;
    const force_spring_unit = V.mul(delta_body_r, 1 / spring_length);
    const force_spring = V.mul(force_spring_unit, spring_length * C.SpringTensionCoefficient * 5.0);

    const body_length_ortho = V.rot90(V.sub(mot.body_r, mot.bike.r));
    const neutral_v = V.add(V.mul(body_length_ortho, mot.bike.angular_velocity), mot.bike.v);
    const relative_v = V.sub(mot.body_v, neutral_v);
    const force_damping = V.mul(relative_v, C.SpringResistanceCoefficient * 3.0);

    const force_total = V.add(
      V.sub(force_spring, force_damping),
      V.mul(gravity, mot.bike.mass * C.Gravity)
    );
    const a = V.mul(force_total, 1 / mot.bike.mass);
    mot.body_v = V.add(mot.body_v, V.mul(a, dt));
    mot.body_r = V.add(mot.body_r, V.mul(mot.body_v, dt));
  }

  // ------------------------------------------------------------------
  // the main physics step (LEPTET.CPP)
  // ------------------------------------------------------------------

  // friction "volume" tracker, used for sound volume later (surlodasverseny)
  let Maxsurlodas = 0;

  function surlodasverseny(pmot, fgumi_v, sebesseg_v) {
    const joirany = { x: Math.cos(pmot.bike.rotation - HALF_PI), y: Math.sin(pmot.bike.rotation - HALF_PI) };
    const fgumi = V.dot(joirany, fgumi_v);
    const sebesseg = V.dot(joirany, sebesseg_v);
    if (fgumi <= 0 || sebesseg <= 0) return;
    const ertek = fgumi * sebesseg * (1.0 / 1.0);
    if (ertek > Maxsurlodas) Maxsurlodas = ertek;
  }

  function szogigazit(pd) {
    if (pd < -PI) pd += TWO_PI;
    if (pd > PI) pd -= TWO_PI;
    return pd;
  }

  // Spring + damping forces between the bike and one wheel, plus drive torque.
  // Returns { Fkerek, Ftest, Mtest }.
  function erokszamitasa(pmot, pkor, i1, j1, kordx, kordy, Mkerek) {
    const gumis = V.add(V.mul(i1, kordx), V.mul(j1, kordy));
    const gumisabsz = V.add(gumis, pmot.bike.r);

    // Spring force from the wheel's stretch relative to its anchor point.
    const gumi = V.sub(gumisabsz, pkor.r);
    let pFkerek, pFtest, pMtest;
    if (Math.abs(gumi.x) > 0.0001 || Math.abs(gumi.y) > 0.0001) {
      const rudhossz = V.len(gumis);
      const rudegys = V.mul(gumis, 1 / rudhossz);
      const rudegysmer = V.rot90(rudegys);
      const Fsugar = V.dot(gumi, rudegys) * C.SpringTensionCoefficient;
      const Ftang = V.dot(gumi, rudegysmer) * C.SpringTensionCoefficient;
      pFkerek = V.add(V.mul(rudegys, Fsugar), V.mul(rudegysmer, Ftang));
      pFtest = V.mul(pFkerek, -1);
      pMtest = -Ftang * rudhossz;
    } else {
      pFkerek = { x: 0, y: 0 };
      pFtest = { x: 0, y: 0 };
      pMtest = 0;
    }

    // Damping from relative velocity of the wheel vs the bike at the wheel anchor.
    // NOTE: no bail-out for kotol ≈ 0 — ref.cpp:320-337 computes these terms
    // unconditionally; a guard here would skip drive-torque transmission.
    const koto = V.sub(pkor.r, pmot.bike.r);
    const kotol = V.len(koto);
    const reckotol = 1.0 / kotol;
    const kotoe = V.mul(koto, reckotol);
    const kotomer = V.rot90(koto);
    const kotoemer = V.rot90(kotoe);
    const korongrelv = V.sub(V.add(V.mul(kotomer, pmot.bike.angular_velocity), pmot.bike.v), pkor.v);
    const vlong = V.dot(korongrelv, kotoe);
    const vtang = V.dot(korongrelv, kotoemer);
    const Fklong = V.mul(kotoe, vlong * C.SpringResistanceCoefficient);
    const Fktang = V.mul(kotoemer, vtang * C.SpringResistanceCoefficient);

    // Drive torque translated into a force on the bike frame.
    const Ftestnyom = V.mul(kotoemer, Mkerek * reckotol);

    pFkerek = V.add(V.add(V.add(pFkerek, Fklong), Fktang), V.mul(Ftestnyom, -1));
    pMtest += -V.dot(Fktang, kotomer);
    pFtest = V.add(V.add(V.sub(pFtest, Fklong), V.mul(Fktang, -1)), Ftestnyom);

    surlodasverseny(pmot, gumi, korongrelv);
    return { Fkerek: pFkerek, Ftest: pFtest, Mtest: pMtest };
  }

  // Compute rider head position from the body position (szamitfejr).
  function szamitfejr(pmot) {
    const i = { x: Math.cos(pmot.bike.rotation), y: Math.sin(pmot.bike.rotation) };
    const j = V.rot90(i);
    if (pmot.flipped_bike) {
      pmot.head_r = V.add(V.add(pmot.body_r, V.mul(i, 0.09)), V.mul(j, 0.63));
    } else {
      pmot.head_r = V.add(V.sub(pmot.body_r, V.mul(i, 0.09)), V.mul(j, 0.63));
    }
  }

  // One physics step. most = game time (s), dt = step (0.0055).
  // gaz/fek/ugrik1/ugrik2 are booleans (already gated by VoltDelay outside).
  function leptet(pmot, most, dt, gaz, fek, ugrik1, ugrik2, segs) {
    Maxsurlodas = 0;
    pmot.max_friction = 0;

    const i1 = { x: Math.cos(pmot.bike.rotation), y: Math.sin(pmot.bike.rotation) };
    const j1 = V.rot90(i1);

    // Brake / gas.
    if (!pmot.prev_brake && fek) {
      pmot.left_wheel_brake_rotation = pmot.left_wheel.rotation - pmot.bike.rotation;
      pmot.right_wheel_brake_rotation = pmot.right_wheel.rotation - pmot.bike.rotation;
    }
    pmot.prev_brake = fek ? 1 : 0;
    let Mkerek2 = 0;
    let Mkerek4 = 0;
    if (gaz) {
      const tulporgesomega = 110.0;
      const gaznyomatek = 600.0;
      if (pmot.flipped_bike) {
        if (pmot.left_wheel.angular_velocity > -tulporgesomega) Mkerek2 = -gaznyomatek;
      } else {
        if (pmot.right_wheel.angular_velocity < tulporgesomega) Mkerek4 = gaznyomatek;
      }
    }
    if (fek) {
      const fekero = 1000.0;
      const surlodas = 100.0;
      let dalfa = pmot.left_wheel.rotation - (pmot.bike.rotation + pmot.left_wheel_brake_rotation);
      let domega = pmot.left_wheel.angular_velocity - pmot.bike.angular_velocity;
      Mkerek2 = -fekero * dalfa - surlodas * domega;
      dalfa = pmot.right_wheel.rotation - (pmot.bike.rotation + pmot.right_wheel_brake_rotation);
      domega = pmot.right_wheel.angular_velocity - pmot.bike.angular_velocity;
      Mkerek4 = -fekero * dalfa - surlodas * domega;
    } else {
      pmot.left_wheel.rotation = szogigazit(pmot.left_wheel.rotation);
      pmot.right_wheel.rotation = szogigazit(pmot.right_wheel.rotation);
    }

    const rl = erokszamitasa(pmot, pmot.left_wheel, i1, j1, LeftWheelDX, LeftWheelDY, Mkerek2);
    const rr = erokszamitasa(pmot, pmot.right_wheel, i1, j1, RightWheelDX, RightWheelDY, Mkerek4);

    // Volt: finish a pending volt first (kick undo + persistent change).
    let oldomega;
    if (ugrik1 || ugrik2) oldomega = pmot.bike.angular_velocity;

    if (pmot.volting_right && (ugrik1 || ugrik2 || most > pmot.right_volt_time + C.VoltDelay * 0.25)) {
      pmot.bike.angular_velocity += Loket;
      if (pmot.bike.angular_velocity > pmot.angular_velocity_pre_right_volt)
        pmot.bike.angular_velocity = pmot.angular_velocity_pre_right_volt;
      if (pmot.bike.angular_velocity > 0.0) {
        pmot.bike.angular_velocity -= Omegavalt;
        if (pmot.bike.angular_velocity < 0.0) pmot.bike.angular_velocity = 0.0;
      }
      pmot.volting_right = 0;
      pmot.angular_velocity_pre_right_volt = -1.0;
      pmot.right_volt_time = -1.0;
    }
    if (pmot.volting_left && (ugrik1 || ugrik2 || most > pmot.left_volt_time + C.VoltDelay * 0.25)) {
      pmot.bike.angular_velocity -= Loket;
      if (pmot.bike.angular_velocity < pmot.angular_velocity_pre_left_volt)
        pmot.bike.angular_velocity = pmot.angular_velocity_pre_left_volt;
      if (pmot.bike.angular_velocity < 0.0) {
        pmot.bike.angular_velocity += Omegavalt;
        if (pmot.bike.angular_velocity > 0.0) pmot.bike.angular_velocity = 0.0;
      }
      pmot.volting_left = 0;
      pmot.angular_velocity_pre_left_volt = -1.0;
      pmot.left_volt_time = -1.0;
    }

    // Start a new volt.
    if (ugrik1) {
      pmot.volting_right = 1;
      pmot.angular_velocity_pre_right_volt = pmot.bike.angular_velocity;
      pmot.right_volt_time = most;
      pmot.bike.angular_velocity -= Loket;
    }
    if (ugrik2) {
      pmot.volting_left = 1;
      pmot.angular_velocity_pre_left_volt = pmot.bike.angular_velocity;
      pmot.left_volt_time = most;
      pmot.bike.angular_velocity += Loket;
    }
    if (ugrik1 || ugrik2) {
      // Give the rider an impulse matching the bike's rotation change.
      const domega = pmot.bike.angular_velocity - oldomega;
      const tangens = V.rot90(V.sub(pmot.body_r, pmot.bike.r));
      pmot.body_v = V.add(pmot.body_v, V.mul(tangens, domega));
      pmot.last_volt_time = most;
    }

    // Integrate: rider first, then bike (no collision), then wheels (collision).
    // Gravity for rigid bodies is ± world basis vectors (C: -Vect2j*mas*Gravity for Down).
    const g = GRAV[pmot.gravity_direction];
    body_movement(pmot, g, i1, j1, dt);
    rigidbody_movement(
      pmot.bike,
      V.add(V.add(rl.Ftest, rr.Ftest), V.mul(g, pmot.bike.mass * C.Gravity)),
      rl.Mtest + rr.Mtest,
      dt,
      false,
      segs
    );
    rigidbody_movement(
      pmot.left_wheel,
      V.add(rl.Fkerek, V.mul(g, pmot.left_wheel.mass * C.Gravity)),
      Mkerek2,
      dt,
      true,
      segs
    );
    rigidbody_movement(
      pmot.right_wheel,
      V.add(rr.Fkerek, V.mul(g, pmot.right_wheel.mass * C.Gravity)),
      Mkerek4,
      dt,
      true,
      segs
    );

    szamitfejr(pmot);
    pmot.max_friction = Maxsurlodas;
  }

  // ------------------------------------------------------------------
  // death / object checks (LEPTET.CPP vizsgalat)
  // ------------------------------------------------------------------
  // Returns: 0 = dead (head hit), 1 = finished (exit), 2 = nothing special.
  function vizsgalat(pmot, level) {
    const res = get_two_anchor_points(pmot.head_r, C.HeadRadius, level.segments);
    if (res.count > 0) return 0;

    let voltkaja = 1;
    while (voltkaja) {
      voltkaja = 0;
      const ids = [
        get_touching_object(pmot.left_wheel.r, pmot.left_wheel.radius, level),
        get_touching_object(pmot.right_wheel.r, pmot.right_wheel.radius, level),
        get_touching_object(pmot.head_r, C.HeadRadius, level),
      ];
      for (let i = 0; i < 3; i++) {
        const id = ids[i];
        if (id < 0) continue;
        const obj = level.objects[id];
        if (obj.type === "apple") {
          obj.active = false;
          pmot.apple_count++;
          EM.Physics.events.push({ type: "apple", idx: id });
          // gravity apple (Elma: kajatipus 1=UP 2=DOWN 3=LEFT 4=RIGHT → gravirany 0..3)
          if (obj.prop >= 1 && obj.prop <= 4) {
            pmot.gravity_direction = obj.prop - 1; // prop 1→0(UP), 2→1(DOWN), 3→2(LEFT), 4→3(RIGHT)
          }
          voltkaja = 1; // keep checking, eating one apple may reveal another
        } else if (obj.type === "killer") {
          return 0;
        } else if (obj.type === "exit") {
          // Total apple count is per-level constant — compute once and cache
          // on the level object instead of filtering the array every tick.
          if (level._totalApples === undefined) {
            level._totalApples = 0;
            for (let k = 0; k < level.objects.length; k++) {
              if (level.objects[k].type === "apple") level._totalApples++;
            }
          }
          if (pmot.apple_count >= level._totalApples) return 1;
        }
      }
    }
    return 2;
  }

  function get_touching_object(r, radius, level) {
    for (let i = 0; i < level.objects.length; i++) {
      const obj = level.objects[i];
      if (!obj.active) continue; // skip eaten apples and the (deactivated) start
      // use physics coords (px/py for .lev levels, x/y for built-in levels)
      const ox = obj.px !== undefined ? obj.px : obj.x;
      const oy = obj.py !== undefined ? obj.py : obj.y;
      const diff = V.sub(r, { x: ox, y: oy });
      const max_distance = radius + C.ObjectRadius;
      if (diff.x * diff.x + diff.y * diff.y < max_distance * max_distance) {
        return i;
      }
    }
    return -1;
  }

  // Place the motor at the level's start object (level.cpp:1105).
  function place_at_start(mot, level) {
    const start = level.objects.find((o) => o.type === "start");
    if (!start) throw new Error("Start object not found in level!");
    const sx = start.px !== undefined ? start.px : start.x;
    const sy = start.py !== undefined ? start.py : start.y;
    const offset = V.sub({ x: sx, y: sy }, mot.left_wheel.r);
    mot.bike.r = V.add(mot.bike.r, offset);
    mot.left_wheel.r = V.add(mot.left_wheel.r, offset);
    mot.right_wheel.r = V.add(mot.right_wheel.r, offset);
    mot.body_r = V.add(mot.body_r, offset);
    start.active = false; // start object stops colliding once the ride begins
    szamitfejr(mot);
    mot.prev_head_r.x = mot.head_r.x;
    mot.prev_head_r.y = mot.head_r.y;
  }

  return {
    C: C,
    events: [],
    newMotor: newMotor,
    leptet: leptet,
    vizsgalat: vizsgalat,
    get_two_anchor_points: get_two_anchor_points,
    place_at_start: place_at_start,
    szamitfejr: szamitfejr,
    LeftWheelDX: LeftWheelDX,
    LeftWheelDY: LeftWheelDY,
    RightWheelDX: RightWheelDX,
    RightWheelDY: RightWheelDY,
    BodyDY: BodyDY,
  };
})();
