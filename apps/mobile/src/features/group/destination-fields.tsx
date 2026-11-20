import type { PixKeyType } from '@tenace/types';
import { View } from 'react-native';
import { PIX_TYPES } from '@/lib/constants';
import { Chip, Field, Input, T } from '@/ui/kit';

export interface DestinationForm {
  label: string;
  holderName: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  bankInfo: string;
  city: string;
}

const KEYBOARD: Record<PixKeyType, 'phone-pad' | 'email-address' | 'number-pad' | 'default'> = { phone: 'phone-pad', email: 'email-address', cpf: 'number-pad', cnpj: 'number-pad', random: 'default' };

/** "Para onde vai o dinheiro?" — shared by the new-group wizard and the group settings. */
export function DestinationFields({ value, onChange, labelHint, pixOptional }: { value: DestinationForm; onChange: (d: DestinationForm) => void; labelHint?: string; pixOptional?: boolean }) {
  const set = (patch: Partial<DestinationForm>) => onChange({ ...value, ...patch });
  return (
    <View style={{ gap: 16 }}>
      <Field label="Destino" hint={labelHint}>
        <Input maxLength={60} value={value.label} onChangeText={(label) => set({ label })} accessibilityLabel="Destino" />
      </Field>
      <View style={{ gap: 8 }}>
        <T size={14} weight="semibold">
          {pixOptional ? 'Tipo de chave PIX' : 'Tipo de chave'}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PIX_TYPES.map((t) => (
            <Chip key={t.value} active={value.pixKeyType === t.value} onPress={() => set({ pixKeyType: t.value })}>
              {t.label}
            </Chip>
          ))}
        </View>
      </View>
      <Field label={pixOptional ? 'Chave PIX (opcional)' : 'Chave PIX'}>
        <Input maxLength={100} autoCapitalize="none" autoCorrect={false} keyboardType={KEYBOARD[value.pixKeyType]} value={value.pixKey} onChangeText={(pixKey) => set({ pixKey })} accessibilityLabel="Chave PIX" />
      </Field>
      <Field label="Nome do recebedor">
        <Input maxLength={60} value={value.holderName} onChangeText={(holderName) => set({ holderName })} accessibilityLabel="Nome do recebedor" />
      </Field>
      <Field label="Cidade" hint="Aparece no QR do PIX">
        <Input maxLength={40} value={value.city} onChangeText={(city) => set({ city })} accessibilityLabel="Cidade" />
      </Field>
      <Field label={pixOptional ? 'Outros dados (opcional)' : 'Outros dados'}>
        <Input multiline maxLength={300} placeholder="Banco, agência, conta…" value={value.bankInfo} onChangeText={(bankInfo) => set({ bankInfo })} accessibilityLabel="Outros dados" />
      </Field>
    </View>
  );
}
