import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, createEphemeralClient, isSupabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Sync personal avatar for the current account
  useEffect(() => {
    if (user?.id) {
      try {
        const stored = localStorage.getItem(`bicor_avatar_${user.id}`);
        const meta = user.user_metadata?.avatar_url;
        const prof = profile?.avatar_url;
        setAvatarUrl(stored || prof || meta || null);
      } catch (err) {
        setAvatarUrl(null);
      }
    } else {
      setAvatarUrl(null);
    }
  }, [user?.id, profile?.avatar_url]);

  const updateAvatar = (newAvatarDataUrl) => {
    if (!user?.id) return;
    if (newAvatarDataUrl) {
      try {
        localStorage.setItem(`bicor_avatar_${user.id}`, newAvatarDataUrl);
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }
      setAvatarUrl(newAvatarDataUrl);
      try {
        if (isSupabaseConfigured) {
          supabase.auth.updateUser({ data: { avatar_url: newAvatarDataUrl } }).catch(() => {});
          supabase.from('profiles').update({ avatar_url: newAvatarDataUrl }).eq('id', user.id).catch(() => {});
        }
      } catch (e) {}
    } else {
      try {
        localStorage.removeItem(`bicor_avatar_${user.id}`);
      } catch (err) {}
      setAvatarUrl(null);
      try {
        if (isSupabaseConfigured) {
          supabase.auth.updateUser({ data: { avatar_url: null } }).catch(() => {});
          supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id).catch(() => {});
        }
      } catch (e) {}
    }
  };

  // Fetch profile for an authenticated user ID with auto-recovery for missing profiles
  const fetchProfile = async (userId, authUser = null) => {
    if (!userId || !isSupabaseConfigured) {
      setProfile(null);
      setRole(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data && data.role) {
        const effectiveRole = data.role === 'operator' ? 'staff' : (data.role === 'user' ? 'student' : data.role);
        const resolvedProfile = { ...data, role: effectiveRole };
        setProfile(resolvedProfile);
        setRole(effectiveRole);
        return resolvedProfile;
      }

      // If profile record is missing from database (e.g. was deleted during staff removal), auto-heal
      console.warn('Profile record missing for user', userId, '– restoring profile to regular user.');
      const activeUser = authUser || user;
      const fallbackName = activeUser?.user_metadata?.full_name || activeUser?.email?.split('@')[0] || 'User';
      const fallbackEmail = activeUser?.email || '';
      // Authoritative default for an orphaned/deleted profile: 'student' (regular user)
      const fallbackRole = 'student';

      const { data: createdProfile, error: insertErr } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: fallbackName,
          email: fallbackEmail,
          role: fallbackRole,
          status: 'active',
        })
        .select()
        .single();

      if (createdProfile && !insertErr) {
        const effectiveRole = createdProfile.role === 'operator' ? 'staff' : (createdProfile.role === 'user' ? 'student' : createdProfile.role);
        const resolvedProfile = { ...createdProfile, role: effectiveRole };
        setProfile(resolvedProfile);
        setRole(effectiveRole);
        return resolvedProfile;
      }

      // Safe memory fallback if database upsert fails
      const memoryProfile = {
        id: userId,
        full_name: fallbackName,
        email: fallbackEmail,
        role: fallbackRole,
        status: 'active',
      };
      setProfile(memoryProfile);
      setRole(fallbackRole);
      return memoryProfile;
    } catch (err) {
      console.error('Profile fetch exception:', err);
      const activeUser = authUser || user;
      const memoryProfile = {
        id: userId,
        full_name: activeUser?.user_metadata?.full_name || activeUser?.email?.split('@')[0] || 'User',
        email: activeUser?.email || '',
        role: 'student',
        status: 'active',
      };
      setProfile(memoryProfile);
      setRole('student');
      return memoryProfile;
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // 1. Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id, currentUser).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error('Session get error:', err);
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        await fetchProfile(currentUser.id, currentUser);
      } else {
        setProfile(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign up a student (public registration always gets role=student)
  const registerStudent = async (email, password, fullName) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured yet. Please update your .env file with your Supabase credentials.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          full_name: fullName.trim(),
        }
      }
    });

    if (authError) {
      throw authError;
    }

    const createdUser = authData?.user;
    if (!createdUser) {
      throw new Error('User creation failed. Please check your credentials and try again.');
    }

    // Insert profile record with role='student' if session is active
    if (authData?.session) {
      await supabase
        .from('profiles')
        .upsert({
          id: createdUser.id,
          full_name: fullName.trim(),
          email: email.trim(),
          role: 'student',
          status: 'active',
        });

      setUser(createdUser);
      const newProfile = {
        id: createdUser.id,
        full_name: fullName.trim(),
        email: email.trim(),
        role: 'student',
        status: 'active',
      };
      setProfile(newProfile);
      setRole('student');
    }

    return {
      user: createdUser,
      session: authData?.session,
      needsEmailConfirmation: false
    };
  };

  // Sign in – returns role so caller can redirect properly
  const login = async (email, password) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured yet. Please update your .env file with your Supabase credentials.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw error;
    }

    if (data?.user) {
      setUser(data.user);
      let userProfile = await fetchProfile(data.user.id, data.user);

      if (!userProfile || !userProfile.role) {
        // Fallback: create default student profile if not found
        const fallbackRole = data.user.user_metadata?.role || 'student';
        const fallbackName = data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User';
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: fallbackName,
            email: data.user.email,
            role: fallbackRole,
            status: 'active'
          });
          userProfile = await fetchProfile(data.user.id, data.user);
        } catch (e) {
          console.warn('Fallback profile creation failed:', e);
        }
      }

      // Check if account is deactivated by an administrator
      if (userProfile?.status === 'inactive' && userProfile?.role !== 'admin') {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setRole(null);
        throw new Error('Your account has been deactivated by an administrator. Please contact support to reactivate your account.');
      }

      const effectiveRole = userProfile?.role || 'student';
      const resolvedProfile = userProfile || { role: effectiveRole, full_name: data.user.email?.split('@')[0] || 'User', status: 'active' };
      return { user: data.user, profile: resolvedProfile };
    }

    return data;
  };

  // Sign out
  const logout = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setProfile(null);
    setRole(null);
  };

  const refreshProfile = async () => {
    if (user?.id) {
      return await fetchProfile(user.id);
    }
  };

  // Admin: create a staff account.
  // We use an ephemeral client so creating this user does not log out or alter the current admin session.
  // We also pass role: 'staff' in auth metadata so the database trigger creates the profile as staff directly.
  const createStaffAccount = async (email, password, fullName) => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured.');
    }

    const ephemeralClient = createEphemeralClient();

    const { data: authData, error: authError } = await ephemeralClient.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role: 'staff',
        }
      }
    });

    if (authError) throw authError;

    const newUser = authData?.user;
    if (!newUser) throw new Error('Failed to create user account.');

    // Ensure the profile in public.profiles is explicitly set to role='staff'
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: newUser.id,
          full_name: fullName.trim(),
          email: email.trim(),
          role: 'staff',
          status: 'active',
        });

      if (profileError) {
        console.warn('Profile upsert warning in createStaffAccount, falling back to update:', profileError);
        await supabase
          .from('profiles')
          .update({
            role: 'staff',
            full_name: fullName.trim(),
            status: 'active',
          })
          .eq('id', newUser.id);
      }
    } catch (err) {
      console.warn('Profile sync exception:', err);
    }

    return { user: newUser };
  };

  const value = {
    user,
    profile,
    role,
    loading,
    isConfigured: isSupabaseConfigured,
    registerStudent,
    createStaffAccount,
    login,
    logout,
    refreshProfile,
    avatarUrl,
    updateAvatar,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
