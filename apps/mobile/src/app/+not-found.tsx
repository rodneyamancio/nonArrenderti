import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, EmptyState } from '@/ui/kit';
import { useTheme } from '@/ui/theme-provider';

export default function NotFound() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
      <EmptyState emoji="🧭" title="Página não encontrada" description="Esse endereço não existe no app." action={<Button label="Ir para o início" onPress={() => router.replace('/')} />} />
    </View>
  );
}
