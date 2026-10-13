import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { notify } from '../lib/notify';
import { supabase } from '../supabase';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [nickname, setNickname] = useState('');

  const handleSignUp = async () => {
    console.log('🔥 handleSignUp 실행됨');

    if (!email.trim() || !password || !nickname.trim()) {
      notify('알림', '모든 정보를 입력해주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      notify('알림', '비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setLoading(true);

    try {
      const API_URL = process.env.EXPO_PUBLIC_FASHION_API_URL?.replace(/\/$/, '') || 'http://localhost:8080';

      console.log('회원가입 URL:', `${API_URL}/api/auth/join`);
      const response = await fetch(`${API_URL}/api/auth/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
          nickname: nickname.trim(),
        }),
      });

      console.log('회원가입 status:', response.status);

      const responseText = await response.text();
      console.log('회원가입 response:', responseText);

      let responseData: any = {};
      try {
        responseData = JSON.parse(responseText);
      } catch (err) {}

      if (response.ok) {
        notify('가입 성공!', '환영합니다. 이제 로그인해주세요.', [
          { text: '확인', onPress: () => router.replace('/login') },
        ]);
      } else {
        notify('회원가입 실패', responseData.error || responseData.message || '가입 중 오류가 발생했습니다.');
      }
    } catch (e) {
      notify('네트워크 오류', '서버와 통신할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 구글 소셜 회원가입/로그인 (원클릭 시작)
   */
  const signUpWithGoogle = async () => {
    setGoogleLoading(true);
    try {
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/login`
          : 'http://localhost:8081/login';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        notify('구글 회원가입 실패', error.message);
        setGoogleLoading(false);
      }
    } catch (err: any) {
      notify('오류', '구글 회원가입 중 문제가 발생했습니다.');
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>새 계정 만들기</Text>
      <Text style={styles.subtitle}>TexTyle에 오신 것을 환영합니다</Text>

      <TextInput
        style={styles.input}
        placeholder="이메일"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!loading && !googleLoading}
      />
      <TextInput
        style={styles.input}
        placeholder="닉네임"
        value={nickname}
        onChangeText={setNickname}
        editable={!loading && !googleLoading}
      />
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="비밀번호 (8자 이상, 영문/숫자/특수문자 포함)"
          placeholderTextColor="#A0A0A0"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          editable={!loading && !googleLoading}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPassword((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showPassword ? 'eye-outline' : 'eye-off-outline'}
            size={22}
            color="#8E8E8E"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.passwordInput}
          placeholder="비밀번호 확인"
          placeholderTextColor="#A0A0A0"
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry={!showPasswordConfirm}
          autoCapitalize="none"
          editable={!loading && !googleLoading}
        />
        <TouchableOpacity
          style={styles.eyeButton}
          onPress={() => setShowPasswordConfirm((prev) => !prev)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={showPasswordConfirm ? 'eye-outline' : 'eye-off-outline'}
            size={22}
            color="#8E8E8E"
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, (loading || googleLoading) && styles.disabledButton]}
        onPress={handleSignUp}
        disabled={loading || googleLoading}
      >
        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={[styles.buttonText, { marginLeft: 8 }]}>가입 처리 중...</Text>
          </View>
        ) : (
          <Text style={styles.buttonText}>가입하기</Text>
        )}
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>또는</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={[styles.googleButton, (loading || googleLoading) && styles.disabledButton]}
        onPress={signUpWithGoogle}
        disabled={loading || googleLoading}
        activeOpacity={0.8}
      >
        {googleLoading ? (
          <View style={styles.googleButtonContent}>
            <ActivityIndicator color="#EA4335" size="small" />
            <Text style={styles.googleButtonText}>Google 로그인 창으로 이동 중...</Text>
          </View>
        ) : (
          <View style={styles.googleButtonContent}>
            <FontAwesome name="google" size={19} color="#EA4335" />
            <Text style={styles.googleButtonText}>Google로 계속하기</Text>
          </View>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>이미 계정이 있으신가요? 로그인</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 10, color: '#171A20' },
  subtitle: { fontSize: 16, color: '#393C41', marginBottom: 30 },
  input: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 8, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#EEEEEE', color: '#171A20' },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  passwordInput: {
    flex: 1,
    padding: 15,
    fontSize: 16,
    color: '#171A20',
  },
  eyeButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: { backgroundColor: '#3E6AE1', paddingVertical: 15, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: '#8E8E8E',
    fontWeight: '500',
  },

  googleButton: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E4E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    color: '#1F1F1F',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    marginLeft: 10,
  },
  disabledButton: { opacity: 0.68 },

  backButton: { marginTop: 20, alignItems: 'center' },
  backButtonText: { color: '#3E6AE1', fontSize: 15, fontWeight: '500' }
});
