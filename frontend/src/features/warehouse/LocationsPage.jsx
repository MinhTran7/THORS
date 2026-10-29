import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Typography
} from '@mui/material';

import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import {
  active,
  Choice,
  Field,
  Metrics,
  PhotoPicker,
  Status,
  Title
} from './components';
import {
  locationLabel,
  number,
  statusLabel,
  variantLabel
} from './model';
import {
  buildRackLayout,
  findCollision,
  relativePlacement,
  snapRack,
  rackHeight,
  RACK_WIDTH,
  RACK_HEADER,
  RACK_FOOTER,
  RACK_TIER,
  RACK_TIER_GAP,
  MAX_COORDINATE
} from './rackLayout';

function RackForm({ rack, tier, rackId, onClose }) {
  const { data, run } = useWarehouse();
  const [error, setError] = useState('');
  const isTier = rackId != null;

  const layout = useMemo(
    () => buildRackLayout(data.racks, data.tiers),
    [data.racks, data.tiers]
  );

  const references = layout.filter(
    (r) => r.rack_id !== rack?.rack_id
  );

  const candidate = rack
    ? layout.find((r) => r.rack_id === rack.rack_id)
    : {
        rack_id: -1,
        x: 40,
        y: 40,
        width: RACK_WIDTH,
        height: rackHeight(0)
      };

  let suggested = {
    referenceId: references[0]?.rack_id || '',
    direction: rack
      ? 'KEEP'
      : references.length
        ? 'RIGHT'
        : 'FIRST'
  };

  if (!rack && !isTier) {
    outer: for (const ref of references) {
      for (const direction of ['RIGHT', 'BELOW', 'LEFT', 'ABOVE']) {
        try {
          relativePlacement(
            candidate,
            layout,
            ref.rack_id,
            direction
          );

          suggested = {
            referenceId: ref.rack_id,
            direction
          };

          break outer;
        } catch {
          // Thử hướng tiếp theo để tìm vị trí gợi ý.
        }
      }
    }
  }

  const f = useFormik({
    initialValues: isTier
      ? {
          number: tier?.level_number || 1,
          status: tier?.status || 'AVAILABLE',
          active: tier ? active(tier.is_active) : true
        }
      : {
          code: rack?.rack_code || '',
          zone: rack?.zone || '',
          ...suggested,
          active: rack ? active(rack.is_active) : true
        },

    validationSchema: isTier
      ? Yup.object({
          number: Yup.number()
            .integer()
            .min(1)
            .max(50)
            .required()
        })
      : Yup.object({
          code: Yup.string()
            .matches(
              /^[\p{L}\p{N}_-]{1,20}$/u,
              'Mã kệ: tối đa 20 chữ/số, dấu - hoặc _.'
            )
            .required('Nhập mã kệ.'),
          direction: Yup.string()
            .oneOf([
              'KEEP',
              'FIRST',
              'RIGHT',
              'LEFT',
              'ABOVE',
              'BELOW'
            ])
            .required(),
          zone: Yup.string().max(50)
        }),

    onSubmit: async (values) => {
      setError('');

      try {
        const id = isTier
          ? tier?.shelf_level_id
          : rack?.rack_id;

        if (isTier) {
          const current = layout.find(
            (r) => r.rack_id === rackId
          );

          const next = {
            ...current,
            height: rackHeight(
              data.tiers.filter(
                (t) => t.rack_id === rackId
              ).length + (tier ? 0 : 1)
            )
          };

          const conflict = findCollision(next, layout);

          if (conflict) {
            throw new Error(
              `Thêm tầng sẽ vướng kệ ${conflict.rack_code}. Hãy chuyển kệ ra chỗ trống trước.`
            );
          }
        } else {
          relativePlacement(
            candidate,
            layout,
            values.referenceId,
            values.direction
          );
        }

        await run(
          () =>
            api(
              isTier
                ? `/warehouse/racks/${rackId}/tiers${id ? `/${id}` : ''}`
                : `/warehouse/racks${id ? `/${id}` : ''}/relative`,
              {
                method: id ? 'PUT' : 'POST',
                body: isTier
                  ? {
                      ...values,
                      number: Number(values.number)
                    }
                  : {
                      code: values.code,
                      zone: values.zone,
                      active: values.active,
                      direction: values.direction,
                      referenceRackId:
                        values.direction === 'KEEP' ||
                        values.direction === 'FIRST'
                          ? null
                          : Number(values.referenceId)
                    }
              }
            ),
          'Đã lưu cấu hình kho.'
        );

        onClose();
      } catch (e) {
        setError(e.message);
      }
    }
  });

  let placementMessage = null;

  if (
    !isTier &&
    references.length &&
    f.values.direction !== 'KEEP'
  ) {
    try {
      const preview = relativePlacement(
        candidate,
        layout,
        f.values.referenceId,
        f.values.direction
      );

      const ref = references.find(
        (r) => r.rack_id === Number(f.values.referenceId)
      );

      const labels = {
        RIGHT: 'bên phải',
        LEFT: 'bên trái',
        ABOVE: 'phía trên',
        BELOW: 'phía dưới'
      };

      placementMessage = {
        text:
          `Kệ sẽ được đặt ${labels[f.values.direction]} kệ ${ref.rack_code}, căn thẳng và chừa lối đi.` +
          (
            preview.shifted
              ? ' Sơ đồ sẽ tự chừa thêm chỗ ở mép.'
              : ''
          )
      };
    } catch (e) {
      placementMessage = {
        error: true,
        text: e.message
      };
    }
  }

  const field = (name, label, type = 'text') => (
    <Field
      id={`rack-${name}`}
      label={label}
      name={name}
      value={f.values[name]}
      type={type}
      onChange={f.handleChange}
      error={f.touched[name] && Boolean(f.errors[name])}
      helperText={f.touched[name] && f.errors[name]}
    />
  );

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => !f.isSubmitting && onClose()}
    >
      <Box component="form" onSubmit={f.handleSubmit}>
        <DialogTitle>
          {isTier
            ? tier
              ? 'Sửa tầng'
              : 'Thêm tầng'
            : rack
              ? 'Sửa kệ'
              : 'Thêm kệ'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {isTier ? (
              <>
                {field('number', 'Số tầng (1–50)', 'number')}

                <Choice
                  label="Trạng thái tầng"
                  name="status"
                  value={f.values.status}
                  onChange={f.handleChange}
                >
                  {[
                    'AVAILABLE',
                    'FULL',
                    'BLOCKED',
                    'MAINTENANCE'
                  ].map((s) => (
                    <MenuItem key={s} value={s}>
                      {statusLabel[s]}
                    </MenuItem>
                  ))}
                </Choice>
              </>
            ) : (
              <>
                {field('code', 'Mã kệ')}
                {field('zone', 'Khu vực')}

                {references.length ? (
                  <>
                    <Choice
                      label="Đặt kệ ở đâu?"
                      name="direction"
                      value={f.values.direction}
                      onChange={f.handleChange}
                    >
                      {rack && (
                        <MenuItem value="KEEP">
                          Giữ nguyên vị trí
                        </MenuItem>
                      )}
                      <MenuItem value="RIGHT">Bên phải</MenuItem>
                      <MenuItem value="LEFT">Bên trái</MenuItem>
                      <MenuItem value="ABOVE">Phía trên</MenuItem>
                      <MenuItem value="BELOW">Phía dưới</MenuItem>
                    </Choice>

                    {f.values.direction !== 'KEEP' && (
                      <Choice
                        label="So với kệ"
                        name="referenceId"
                        value={f.values.referenceId}
                        onChange={f.handleChange}
                      >
                        {references.map((r) => (
                          <MenuItem
                            key={r.rack_id}
                            value={r.rack_id}
                          >
                            Kệ {r.rack_code}
                            {active(r.is_active)
                              ? ''
                              : ' (đã ẩn)'}
                          </MenuItem>
                        ))}
                      </Choice>
                    )}
                  </>
                ) : (
                  <Alert severity="info">
                    {rack
                      ? 'Giữ nguyên vị trí kệ.'
                      : 'Đây là kệ đầu tiên. Hệ thống tự đặt vào sơ đồ.'}
                  </Alert>
                )}

                {placementMessage && (
                  <Alert
                    severity={
                      placementMessage.error
                        ? 'warning'
                        : 'info'
                    }
                  >
                    {placementMessage.text}
                  </Alert>
                )}
              </>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={f.values.active}
                  onChange={(e) =>
                    f.setFieldValue('active', e.target.checked)
                  }
                />
              }
              label="Đang sử dụng"
            />

            <Alert severity="info">
              Chỉ ẩn kệ/tầng khi đã chuyển hết hàng. Trạng thái
              “Đã đầy”, “Tạm khóa”, “Bảo trì” ngăn đưa thêm hàng
              vào tầng đó.
            </Alert>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={f.isSubmitting} onClick={onClose}>
            Quay lại
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={f.isSubmitting}
          >
            Lưu
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function MoveForm({ variant, selectedShelf, from, onClose }) {
  const { data, run } = useWarehouse();
  const [error, setError] = useState('');
  const requestKey = useRef(crypto.randomUUID());

  const f = useFormik({
    initialValues: {
      fromLocationId: from || '',
      toShelfId: selectedShelf || '',
      quantity: 1,
      description: '',
      photoKeys: []
    },

    validationSchema: Yup.object({
      quantity: Yup.number()
        .integer('Số lượng phải là số nguyên.')
        .min(1)
        .max(1000000)
        .required('Nhập số lượng.')
    }),

    onSubmit: async (values) => {
      setError('');

      try {
        await run(
          () =>
            api('/warehouse/moves', {
              method: 'POST',
              body: {
                detailId: variant.detail_id,
                fromLocationId: values.fromLocationId
                  ? Number(values.fromLocationId)
                  : null,
                toShelfId: values.toShelfId
                  ? Number(values.toShelfId)
                  : null,
                quantity: Number(values.quantity),
                description: values.description,
                photoKeys: values.photoKeys,
                requestKey: requestKey.current
              }
            }),
          'Đã sắp xếp vị trí.'
        );

        onClose();
      } catch (e) {
        setError(e.message);
      }
    }
  });

  const currentFrom = data.locations.find(
    (l) =>
      l.product_location_id === Number(f.values.fromLocationId)
  );

  const existing = data.locations.find(
    (l) =>
      l.detail_id === variant.detail_id &&
      l.shelf_level_id === Number(f.values.toShelfId)
  );

  const needMetadata =
    f.values.toShelfId &&
    (
      !existing ||
      !existing.description?.trim() ||
      !data.images.some(
        (i) =>
          i.product_location_id === existing.product_location_id
      )
    );

  const available = currentFrom
    ? currentFrom.quantity
    : Number(variant.unassigned_quantity);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="md"
      onClose={() => !f.isSubmitting && onClose()}
    >
      <Box component="form" onSubmit={f.handleSubmit}>
        <DialogTitle>
          Xếp / chuyển vị trí · {variantLabel(variant)}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Thao tác chỉ đổi vị trí lưu hàng. Tổng tồn không thay đổi.
            </Alert>

            <Choice
              label="Lấy hàng từ"
              value={f.values.fromLocationId}
              onChange={(e) =>
                f.setFieldValue('fromLocationId', e.target.value)
              }
            >
              <MenuItem value="">
                Chưa xếp vị trí ({number(variant.unassigned_quantity)})
              </MenuItem>

              {data.locations
                .filter(
                  (l) =>
                    l.detail_id === variant.detail_id &&
                    l.quantity > 0
                )
                .map((l) => (
                  <MenuItem
                    key={l.product_location_id}
                    value={l.product_location_id}
                  >
                    {locationLabel(data, l.shelf_level_id)}
                    {' '}({number(l.quantity)})
                  </MenuItem>
                ))}
            </Choice>

            <Choice
              label="Chuyển đến"
              value={f.values.toShelfId}
              onChange={(e) =>
                f.setFieldValue('toShelfId', e.target.value)
              }
            >
              <MenuItem value="">
                Đưa về hàng chưa xếp vị trí
              </MenuItem>

              {data.tiers
                .filter(
                  (t) =>
                    active(t.is_active) &&
                    t.status === 'AVAILABLE' &&
                    data.racks.some(
                      (r) =>
                        r.rack_id === t.rack_id &&
                        active(r.is_active)
                    ) &&
                    t.shelf_level_id !== currentFrom?.shelf_level_id
                )
                .map((t) => (
                  <MenuItem
                    key={t.shelf_level_id}
                    value={t.shelf_level_id}
                  >
                    {locationLabel(data, t.shelf_level_id)}
                  </MenuItem>
                ))}
            </Choice>

            <Field
              id="move-qty"
              label={`Số lượng (nguồn hiện có ${number(available)})`}
              name="quantity"
              type="number"
              value={f.values.quantity}
              onChange={f.handleChange}
              error={
                f.touched.quantity &&
                Boolean(f.errors.quantity)
              }
              helperText={
                f.touched.quantity &&
                f.errors.quantity
              }
            />

            {needMetadata && (
              <>
                <Field
                  id="move-desc"
                  label="Mô tả thực tế tại vị trí mới"
                  name="description"
                  value={f.values.description}
                  onChange={f.handleChange}
                  multiline
                  minRows={2}
                  slotProps={{
                    htmlInput: { maxLength: 2000 }
                  }}
                />

                <PhotoPicker
                  keys={f.values.photoKeys}
                  onChange={(keys) =>
                    f.setFieldValue('photoKeys', keys)
                  }
                />
              </>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button disabled={f.isSubmitting} onClick={onClose}>
            Quay lại
          </Button>

          <Button
            type="submit"
            variant="contained"
            disabled={
              f.isSubmitting ||
              available < 1 ||
              (
                needMetadata &&
                (
                  !f.values.description.trim() ||
                  !f.values.photoKeys.length
                )
              )
            }
          >
            Lưu vị trí
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function MetadataForm({ location, onClose }) {
  const { data, run } = useWarehouse();
  const [description, setDescription] = useState(
    location.description || ''
  );
  const [keys, setKeys] = useState([]);
  const [keep, setKeep] = useState(
    data.images.filter(
      (i) =>
        i.product_location_id === location.product_location_id
    )
  );
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => !waiting && onClose()}
    >
      <DialogTitle>Mô tả và ảnh vị trí</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Field
            id="location-description"
            label="Mô tả thực tế"
            multiline
            minRows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            slotProps={{
              htmlInput: { maxLength: 2000 }
            }}
          />

          <Stack
            direction="row"
            sx={{ gap: 1, flexWrap: 'wrap' }}
          >
            {keep.map((i) => (
              <Box key={i.product_location_image_id}>
                <Box
                  component="img"
                  src={i.image_url}
                  alt="Ảnh vị trí đã lưu"
                  sx={{
                    width: 100,
                    height: 80,
                    objectFit: 'cover'
                  }}
                />

                <Button
                  size="small"
                  onClick={() =>
                    setKeep(keep.filter((x) => x !== i))
                  }
                >
                  Bỏ ảnh
                </Button>
              </Box>
            ))}
          </Stack>

          <PhotoPicker keys={keys} onChange={setKeys} />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button disabled={waiting} onClick={onClose}>
          Quay lại
        </Button>

        <Button
          variant="contained"
          disabled={
            waiting ||
            !description.trim() ||
            keep.length + keys.length > 8 ||
            (
              location.quantity > 0 &&
              !keep.length &&
              !keys.length
            )
          }
          onClick={async () => {
            setWaiting(true);

            try {
              await run(
                () =>
                  api(
                    `/warehouse/locations/${location.product_location_id}`,
                    {
                      method: 'PATCH',
                      body: {
                        description,
                        keepImageIds: keep.map(
                          (i) => i.product_location_image_id
                        ),
                        photoKeys: keys
                      }
                    }
                  ),
                'Đã lưu thông tin vị trí.'
              );

              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setWaiting(false);
            }
          }}
        >
          Lưu thông tin
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function LocationsPage({ editLayout = false }) {
  const { data, owner, busy, run } = useWarehouse();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(null);
  const [rackForm, setRackForm] = useState(null);
  const [move, setMove] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [positions, setPositions] = useState({});
  const [layoutError, setLayoutError] = useState('');

  const drag = useRef(null);
  const canvasScroll = useRef(null);

  const layout = useMemo(
    () => buildRackLayout(data.racks, data.tiers),
    [data.racks, data.tiers]
  );

  const selectedVariant = Number(params.get('variant')) || '';

  const variant = data.variants.find(
    (v) => v.detail_id === selectedVariant
  );

  const tier = data.tiers.find(
    (t) => t.shelf_level_id === selected
  );

  const contents = data.locations.filter(
    (l) =>
      l.shelf_level_id === selected &&
      l.quantity > 0
  );

  const rack = data.racks.find(
    (r) => r.rack_id === tier?.rack_id
  );

  const visible = layout.filter(
    (r) => showHidden || active(r.is_active)
  );

  const canvasWidth = Math.max(
    850,
    ...visible.map(
      (r) =>
        (positions[r.rack_id]?.x ?? r.x) +
        r.width +
        40
    )
  );

  const canvasHeight = Math.max(
    520,
    ...visible.map(
      (r) =>
        (positions[r.rack_id]?.y ?? r.y) +
        r.height +
        40
    )
  );

  const clearDrag = () => {
    drag.current = null;
    setPositions({});
  };

  const targetAt = (e, d) => {
    const clamp = (v) =>
      Math.round(
        Math.max(0, Math.min(MAX_COORDINATE, v)) * 100
      ) / 100;

    return snapRack(
      {
        ...layout.find((r) => r.rack_id === d.id),
        x: clamp(
          d.x +
          e.clientX -
          d.startX +
          (canvasScroll.current?.scrollLeft || 0) -
          d.scrollLeft +
          window.scrollX -
          d.windowX
        ),
        y: clamp(
          d.y +
          e.clientY -
          d.startY +
          (canvasScroll.current?.scrollTop || 0) -
          d.scrollTop +
          window.scrollY -
          d.windowY
        )
      },
      layout
    );
  };

  const blockedAt = (id, point) =>
    findCollision(
      {
        ...layout.find((r) => r.rack_id === id),
        ...point
      },
      layout
    );

  const beginDrag = (e, r) => {
    if (
      !editLayout ||
      !owner ||
      busy ||
      drag.current ||
      e.button !== 0
    ) {
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setLayoutError('');

    drag.current = {
      id: r.rack_id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: r.x,
      y: r.y,
      scrollLeft: canvasScroll.current?.scrollLeft || 0,
      scrollTop: canvasScroll.current?.scrollTop || 0,
      windowX: window.scrollX,
      windowY: window.scrollY
    };
  };

  const updateDrag = (e) => {
    const d = drag.current;

    if (!d || e.pointerId !== d.pointerId) return;

    const point = targetAt(e, d);
    const conflict = blockedAt(d.id, point);

    if (conflict) {
      setLayoutError(
        `Vị trí đang bị kệ ${conflict.rack_code} chiếm. Kệ sẽ không được đặt chồng lên nhau.`
      );
      return;
    }

    setLayoutError('');
    setPositions({ [d.id]: point });
  };

  const endDrag = async (e, r) => {
    const d = drag.current;

    if (!d || e.pointerId !== d.pointerId) return;

    drag.current = null;

    const point = targetAt(e, d);
    const conflict = blockedAt(d.id, point);

    if (conflict) {
      setLayoutError(
        `Không thể đặt kệ ${r.rack_code} chồng lên kệ ${conflict.rack_code}. Đã giữ vị trí cũ.`
      );
      setPositions({});
      return;
    }

    if (
      Math.abs(point.x - d.x) +
      Math.abs(point.y - d.y) < 3
    ) {
      setPositions({});
      return;
    }

    setLayoutError('');
    setPositions({ [d.id]: point });

    try {
      await run(() =>
        api(`/warehouse/racks/${r.rack_id}`, {
          method: 'PUT',
          body: {
            code: r.rack_code,
            zone: r.zone || '',
            ...point,
            active: active(r.is_active)
          }
        })
      );
    } catch {
      // WarehouseContext hiển thị lỗi từ backend.
    } finally {
      setPositions({});
    }
  };

  const addRack = () => {
    setLayoutError('');
    setRackForm({});
  };

  const tidy = async () => {
    setLayoutError('');

    try {
      await run(
        () =>
          api('/warehouse/racks/tidy', {
            method: 'POST'
          }),
        'Đã căn thẳng hàng và chừa lối đi giữa các kệ.'
      );
    } catch {
      // WarehouseContext hiển thị lỗi từ backend.
    }
  };

  return (
    <>
      <Title
        title={
          editLayout
            ? 'Bố cục kho'
            : 'Vị trí lưu kho'
        }
        subtitle={
          editLayout
            ? 'Đặt kệ theo hướng trên, dưới, trái, phải; kéo thả để điều chỉnh hoặc xếp gọn theo hàng.'
            : 'Chọn màu/size để tìm vị trí. Chọn một tầng để xem hàng và ảnh thực tế.'
        }
        action={
          owner &&
          editLayout && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              <Button
                variant="outlined"
                onClick={tidy}
                disabled={busy || !layout.length}
              >
                Xếp gọn theo hàng
              </Button>

              <Button
                variant="contained"
                onClick={addRack}
                disabled={busy}
              >
                Thêm kệ
              </Button>
            </Stack>
          )
        }
      />

      <Metrics
        items={[
          [
            'Kệ đang sử dụng',
            data.racks.filter(
              (r) => active(r.is_active)
            ).length,
            'Trong một kho của cửa hàng'
          ],
          [
            'Tầng đang sử dụng',
            data.tiers.filter(
              (t) =>
                active(t.is_active) &&
                data.racks.some(
                  (r) =>
                    r.rack_id === t.rack_id &&
                    active(r.is_active)
                )
            ).length,
            'Có thể thay đổi theo bố cục'
          ],
          [
            'Chưa xếp vị trí',
            data.variants.reduce(
              (n, v) => n + Number(v.unassigned_quantity),
              0
            ),
            'Đã được tính trong tổng tồn'
          ],
          [
            'Tầng đã đầy / bảo trì',
            data.tiers.filter(
              (t) =>
                active(t.is_active) &&
                data.racks.some(
                  (r) =>
                    r.rack_id === t.rack_id &&
                    active(r.is_active)
                ) &&
                ['FULL', 'MAINTENANCE'].includes(t.status)
            ).length,
            'Không nhận thêm hàng'
          ]
        ]}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'minmax(0,1fr) 310px'
          },
          gap: 2.5
        }}
      >
        <MainCard title="Sơ đồ kho 2D">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ mb: 2 }}
          >
            <Box sx={{ flex: 1 }}>
              <Choice
                label="Tìm vị trí theo sản phẩm / màu / size"
                value={selectedVariant}
                onChange={(e) => {
                  const next = new URLSearchParams(params);

                  e.target.value
                    ? next.set('variant', e.target.value)
                    : next.delete('variant');

                  setParams(next, { replace: true });
                }}
              >
                <MenuItem value="">
                  Xem toàn bộ kho
                </MenuItem>

                {data.variants.map((v) => (
                  <MenuItem
                    key={v.detail_id}
                    value={v.detail_id}
                  >
                    {variantLabel(v)}
                  </MenuItem>
                ))}
              </Choice>
            </Box>

            {editLayout && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showHidden}
                    onChange={(e) =>
                      setShowHidden(e.target.checked)
                    }
                  />
                }
                label="Hiện kệ/tầng đã ẩn"
              />
            )}
          </Stack>

          {variant && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {variantLabel(variant)}
              {' '}· Tổng tồn {number(variant.stock_quantity)}
              {' '}· Chưa xếp {number(variant.unassigned_quantity)}

              {owner && (
                <Button
                  size="small"
                  onClick={() => setMove({ variant })}
                >
                  Xếp / chuyển vị trí
                </Button>
              )}
            </Alert>
          )}

          <Stack
            direction="row"
            sx={{
              flexWrap: 'wrap',
              gap: 1,
              mb: 2
            }}
          >
            {[
              'AVAILABLE',
              'FULL',
              'BLOCKED',
              'MAINTENANCE'
            ].map((s) => (
              <Status key={s} value={s} />
            ))}

            <Chip
              size="small"
              label="Viền xanh: vị trí tìm thấy"
              color="primary"
              variant="outlined"
            />
          </Stack>

          {layoutError && (
            <Alert
              severity="warning"
              onClose={() => setLayoutError('')}
              sx={{ mb: 2 }}
            >
              {layoutError}
            </Alert>
          )}

          <Box
            ref={canvasScroll}
            sx={{
              overflow: 'auto',
              maxHeight: 740,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
              borderRadius: 1
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: canvasWidth,
                height: canvasHeight,
                backgroundImage:
                  'radial-gradient(#cfd6df .8px, transparent .8px)',
                backgroundSize: '20px 20px'
              }}
            >
              {!visible.length && (
                <Typography sx={{ p: 4 }}>
                  Chưa có kệ. Chủ cửa hàng có thể thêm kệ
                  ở mục Bố cục kho.
                </Typography>
              )}

              {visible.map((r) => (
                <Box
                  key={r.rack_id}
                  data-rack-id={r.rack_id}
                  data-rack-code={r.rack_code}
                  sx={{
                    position: 'absolute',
                    width: r.width,
                    height: r.height,
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    left: positions[r.rack_id]?.x ?? r.x,
                    top: positions[r.rack_id]?.y ?? r.y,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'grey.300',
                    borderRadius: 1,
                    boxShadow: 1,
                    opacity: active(r.is_active) ? 1 : 0.5
                  }}
                >
                  <Box
                    role={
                      editLayout && owner
                        ? 'button'
                        : undefined
                    }
                    tabIndex={
                      editLayout && owner
                        ? 0
                        : undefined
                    }
                    aria-label={`Vị trí kệ ${r.rack_code}. Dùng nút Sửa kệ để chọn vị trí.`}
                    onPointerDown={(e) => beginDrag(e, r)}
                    onPointerMove={updateDrag}
                    onPointerUp={(e) => endDrag(e, r)}
                    onPointerCancel={clearDrag}
                    onLostPointerCapture={() => {
                      if (drag.current) clearDrag();
                    }}
                    sx={{
                      p: 1.5,
                      height: RACK_HEADER,
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      overflow: 'hidden',
                      userSelect: 'none',
                      bgcolor: 'grey.100',
                      cursor:
                        owner && editLayout
                          ? 'grab'
                          : 'default',
                      touchAction:
                        owner && editLayout
                          ? 'none'
                          : 'auto'
                    }}
                  >
                    <Typography
                      variant="h5"
                      noWrap
                      title={`Kệ ${r.rack_code}`}
                    >
                      Kệ {r.rack_code}
                    </Typography>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      component="div"
                      title={r.zone || 'Kho cửa hàng'}
                    >
                      {r.zone || 'Kho cửa hàng'}
                    </Typography>
                  </Box>

                  <Stack
                    spacing={RACK_TIER_GAP / 8}
                    sx={{
                      p: 0.75,
                      flex: 1,
                      minHeight: 0,
                      overflow: 'hidden'
                    }}
                  >
                    {data.tiers
                      .filter(
                        (t) =>
                          t.rack_id === r.rack_id &&
                          (
                            showHidden ||
                            active(t.is_active)
                          )
                      )
                      .sort(
                        (a, b) =>
                          b.level_number - a.level_number
                      )
                      .map((t) => {
                        const locations = data.locations.filter(
                          (l) =>
                            l.shelf_level_id === t.shelf_level_id
                        );

                        const hit =
                          selectedVariant &&
                          locations.some(
                            (l) =>
                              l.detail_id === selectedVariant &&
                              l.quantity > 0
                          );

                        return (
                          <Button
                            key={t.shelf_level_id}
                            onClick={() =>
                              setSelected(t.shelf_level_id)
                            }
                            aria-pressed={
                              selected === t.shelf_level_id
                            }
                            sx={{
                              minHeight: RACK_TIER,
                              height: RACK_TIER,
                              flexShrink: 0,
                              overflow: 'hidden',
                              justifyContent: 'space-between',
                              border:
                                selected === t.shelf_level_id || hit
                                  ? '2px solid'
                                  : '1px solid',
                              borderColor:
                                selected === t.shelf_level_id || hit
                                  ? 'primary.main'
                                  : 'divider',
                              bgcolor:
                                t.status === 'FULL'
                                  ? 'error.lighter'
                                  : t.status === 'MAINTENANCE'
                                    ? 'warning.lighter'
                                    : t.status === 'BLOCKED'
                                      ? 'grey.200'
                                      : hit
                                        ? 'primary.lighter'
                                        : 'background.paper',
                              opacity:
                                active(t.is_active) ? 1 : 0.45,
                              px: 1
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              noWrap
                              sx={{
                                minWidth: 0,
                                flex: 1,
                                textAlign: 'left'
                              }}
                              title={`${r.rack_code}${t.level_number}`}
                            >
                              {r.rack_code}
                              {t.level_number}
                            </Typography>

                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              sx={{
                                ml: 0.5,
                                flexShrink: 0
                              }}
                            >
                              {number(
                                locations.reduce(
                                  (n, l) => n + l.quantity,
                                  0
                                )
                              )}
                              {' '}· {statusLabel[t.status]}
                            </Typography>
                          </Button>
                        );
                      })}
                  </Stack>

                  <Box
                    sx={{
                      height: RACK_FOOTER,
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      overflow: 'hidden'
                    }}
                  >
                    {editLayout && owner && (
                      <Stack direction="row" sx={{ p: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() =>
                            setRackForm({
                              rack: {
                                ...r,
                                coordinate_x: r.x,
                                coordinate_y: r.y
                              }
                            })
                          }
                        >
                          Sửa kệ
                        </Button>

                        <Button
                          size="small"
                          onClick={() =>
                            setRackForm({ rackId: r.rack_id })
                          }
                        >
                          Thêm tầng
                        </Button>
                      </Stack>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            Tầng cao hiển thị phía trên; tầng 1 nằm dưới.
            Kéo thanh cuộn để xem các kệ ngoài khung.
          </Typography>
        </MainCard>

        <MainCard
          title={
            tier
              ? `Vị trí ${locationLabel(data, tier.shelf_level_id)}`
              : 'Thông tin vị trí'
          }
        >
          <Stack spacing={2}>
            {tier ? (
              <>
                <Status value={tier.status} />

                <Typography color="text.secondary">
                  Khu vực: {rack?.zone || 'Kho cửa hàng'}
                </Typography>

                {editLayout && owner && (
                  <Button
                    variant="outlined"
                    onClick={() =>
                      setRackForm({
                        tier,
                        rackId: tier.rack_id
                      })
                    }
                  >
                    Sửa tầng / trạng thái
                  </Button>
                )}

                {!contents.length && (
                  <Typography color="text.secondary">
                    Chưa có hàng tại tầng này.
                  </Typography>
                )}

                {contents.map((l) => {
                  const v = data.variants.find(
                    (x) => x.detail_id === l.detail_id
                  );

                  return (
                    <Box
                      key={l.product_location_id}
                      sx={{
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        pt: 2
                      }}
                    >
                      <Typography variant="subtitle2">
                        {v
                          ? variantLabel(v)
                          : `#${l.detail_id}`}
                      </Typography>

                      <Typography sx={{ my: 1 }}>
                        Số lượng: <b>{number(l.quantity)}</b>
                      </Typography>

                      <Typography
                        color="text.secondary"
                        sx={{ whiteSpace: 'pre-wrap' }}
                      >
                        {l.description || 'Chưa có mô tả'}
                      </Typography>

                      <Stack
                        direction="row"
                        sx={{
                          flexWrap: 'wrap',
                          gap: 0.75,
                          my: 1
                        }}
                      >
                        {data.images
                          .filter(
                            (i) =>
                              i.product_location_id ===
                              l.product_location_id
                          )
                          .map((i) => (
                            <Box
                              component="a"
                              href={i.image_url}
                              target="_blank"
                              rel="noreferrer"
                              key={i.product_location_image_id}
                            >
                              <Box
                                component="img"
                                src={i.image_url}
                                alt={`Ảnh tại ${locationLabel(data, l.shelf_level_id)}`}
                                sx={{
                                  width: 100,
                                  height: 80,
                                  objectFit: 'cover',
                                  borderRadius: 1
                                }}
                              />
                            </Box>
                          ))}
                      </Stack>

                      {owner && (
                        <Stack
                          direction="row"
                          sx={{ flexWrap: 'wrap' }}
                        >
                          <Button
                            size="small"
                            onClick={() =>
                              setMove({
                                variant: v,
                                from: l.product_location_id
                              })
                            }
                          >
                            Chuyển hàng
                          </Button>

                          <Button
                            size="small"
                            onClick={() => setMetadata(l)}
                          >
                            Sửa mô tả / ảnh
                          </Button>
                        </Stack>
                      )}
                    </Box>
                  );
                })}

                {owner &&
                  variant &&
                  tier.status === 'AVAILABLE' && (
                    <Button
                      variant="contained"
                      onClick={() =>
                        setMove({
                          variant,
                          selectedShelf: tier.shelf_level_id
                        })
                      }
                    >
                      Xếp hàng đang chọn vào đây
                    </Button>
                  )}
              </>
            ) : (
              <Typography color="text.secondary">
                Chọn một tầng trên sơ đồ để xem số lượng,
                mô tả và ảnh thực tế.
              </Typography>
            )}
          </Stack>
        </MainCard>
      </Box>

      {rackForm && owner && (
        <RackForm
          {...rackForm}
          onClose={() => setRackForm(null)}
        />
      )}

      {move && owner && (
        <MoveForm
          {...move}
          onClose={() => setMove(null)}
        />
      )}

      {metadata && owner && (
        <MetadataForm
          location={metadata}
          onClose={() => setMetadata(null)}
        />
      )}
    </>
  );
}