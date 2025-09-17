import React, { useState } from 'react';
import './userpanel.css';
import playerImg from '../../../../assets/img/player.png';
import coachImg from '../../../../assets/img/coach.png';
import clubImg from '../../../../assets/img/club.png';
import heyatImg from '../../../../assets/img/heyat.png';
import PlayerRegisterModal from '../../../Register/RegisterModal.jsx';
import LoginModal from '../../../Login/LoginModal.jsx';

const panelItems = [
  {
    title: 'بازیکن',
    image: playerImg,
  },
  {
    title: 'مربی | داور',
    image: coachImg,
  },
  {
    title: 'باشگاه',
    image: clubImg,
  },
  {
    title: 'هیأت',
    image: heyatImg,
  },
];

const UserPanel = () => {
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedLoginRole, setSelectedLoginRole] = useState('');

  const handleLoginClick = (title) => {
    if (title === 'هیأت') {
      setSelectedLoginRole('heyat');
    } else if (title === 'بازیکن') {
      setSelectedLoginRole('player');
    } else if (title === 'مربی | داور') {
      setSelectedLoginRole('coach');
    } else if (title === 'باشگاه') {
      setSelectedLoginRole('club');
    }
    setShowLoginModal(true);
  };

  const handleRegisterClick = (title) => {
    if (title === 'بازیکن') {
      setSelectedRole('player');
    } else if (title === 'مربی | داور') {
      setSelectedRole('coach');
    } else if (title === 'باشگاه') {
      setSelectedRole('club');
    }
    setShowRegisterModal(true);
  };

  return (
    <div className="user-panel-wrapper">
      <div className="user-panel">
        <div className="panel">
          <h2>ورود | ثبت نام</h2>
          <div className='panel-wrpper'>
            {panelItems.map((item, i) => (
              <div key={i} className="panel-box">
                <img src={item.image} alt={item.title} className="panel-img" />
                <div className="overlay">
                  <h3>{item.title}</h3>
                  <div className="panel-buttons">
                    <button onClick={() => handleLoginClick(item.title)}>ورود</button>
                    {item.title !== 'هیأت' && (
                      <button onClick={() => handleRegisterClick(item.title)}>ثبت‌نام</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showRegisterModal && (
        <PlayerRegisterModal
          role={selectedRole}
          onClose={() => setShowRegisterModal(false)}
        />
      )}

      {showLoginModal && (
        <LoginModal
          role={selectedLoginRole}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
};

export default UserPanel;
